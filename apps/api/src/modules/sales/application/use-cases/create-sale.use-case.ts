import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { CashRegisterUseCase } from '../../../cash-register/application/use-cases/cash-register.use-case';
import { CacheService } from '../../../../cache/cache.service';
import type { CreateSaleDto } from '../dtos/sale.dto';

/** Redondeo monetario a 2 decimales evitando errores de coma flotante. */
export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const MAX_NUMBER_RETRIES = 5;

export interface SaleLineCalculation {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxIncluded: boolean;
  /** Base gravable (sin impuesto) de la línea */
  net: number;
  tax: number;
  /** Total de la línea con impuesto */
  total: number;
}

/**
 * Cálculo puro de una línea de venta.
 * - Precio con impuesto incluido: el impuesto se extrae del precio (base = total / (1 + tasa)).
 * - Precio sin impuesto: el impuesto se suma sobre la base.
 */
export function calculateLine(input: {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate: number;
  taxIncluded: boolean;
}): SaleLineCalculation {
  const gross = round2(input.quantity * input.unitPrice);
  const discount = round2(input.discount ?? 0);
  if (discount > gross) {
    throw new BadRequestException('El descuento de una línea no puede ser mayor que su valor');
  }
  const afterDiscount = round2(gross - discount);
  let net: number;
  let tax: number;
  if (input.taxIncluded) {
    net = round2(afterDiscount / (1 + input.taxRate));
    tax = round2(afterDiscount - net);
  } else {
    net = afterDiscount;
    tax = round2(net * input.taxRate);
  }
  return {
    productId: input.productId,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    discount,
    taxRate: input.taxRate,
    taxIncluded: input.taxIncluded,
    net,
    tax,
    total: round2(net + tax),
  };
}

@Injectable()
export class CreateSaleUseCase {
  private readonly logger = new Logger(CreateSaleUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cashRegisterUseCase: CashRegisterUseCase,
    private readonly cache: CacheService,
  ) {}

  async execute(dto: CreateSaleDto, tenantId: string, soldById: string) {
    if (!dto.items?.length) throw new BadRequestException('La venta debe tener al menos un producto');

    const saleType = dto.type ?? 'sale';
    const isQuote = saleType === 'quote';

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!client) throw new NotFoundException('Cliente no encontrado');
    }

    if (dto.cashRegisterSessionId) {
      const session = await this.prisma.cashRegisterSession.findFirst({
        where: { id: dto.cashRegisterSessionId, tenantId, status: 'open' },
        select: { branchId: true },
      });
      if (!session) throw new BadRequestException('La sesión de caja no existe o está cerrada');
      if (session.branchId !== dto.branchId) {
        throw new BadRequestException('La caja seleccionada pertenece a otra sucursal');
      }
    }

    const currencyId =
      dto.currencyId ??
      (
        await this.prisma.tenantCurrency.findFirst({
          where: { tenantId, isDefault: true },
          select: { currencyId: true },
        })
      )?.currencyId;
    if (!currencyId) {
      throw new BadRequestException('No hay una divisa por defecto configurada para la empresa');
    }

    // ── Validación de productos y cálculo de líneas ─────────────────────
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, deletedAt: null, status: 'active' },
      select: {
        id: true,
        name: true,
        internalCode: true,
        taxRate: true,
        taxIncluded: true,
        minSalePrice: true,
        trackInventory: true,
        costPrice: true,
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const lines: SaleLineCalculation[] = [];
    const requiredQty = new Map<string, number>();

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new NotFoundException(`Producto ${item.productId} no encontrado o inactivo`);

      const minPrice = Number(product.minSalePrice ?? 0);
      if (minPrice > 0 && item.unitPrice < minPrice) {
        throw new BadRequestException(
          `El precio de ${product.name} (${item.unitPrice}) es menor al mínimo permitido (${minPrice})`,
        );
      }

      lines.push(
        calculateLine({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          taxRate: Number(product.taxRate ?? 0),
          taxIncluded: product.taxIncluded,
        }),
      );

      if (product.trackInventory) {
        requiredQty.set(item.productId, (requiredQty.get(item.productId) ?? 0) + item.quantity);
      }
    }

    const subtotal = round2(lines.reduce((s, l) => s + l.net, 0));
    const taxAmount = round2(lines.reduce((s, l) => s + l.tax, 0));
    const grossTotal = round2(subtotal + taxAmount);
    const globalDiscount = round2(dto.globalDiscount ?? 0);
    if (globalDiscount > grossTotal) {
      throw new BadRequestException('El descuento global no puede superar el total de la venta');
    }
    const total = round2(grossTotal - globalDiscount);

    const payments = isQuote ? [] : dto.payments ?? [];
    const totalPayments = round2(payments.reduce((sum, p) => sum + p.amount, 0));
    const cashPaid = round2(payments.filter((p) => p.type === 'cash').reduce((s, p) => s + p.amount, 0));
    const nonCashPaid = round2(totalPayments - cashPaid);

    if (saleType === 'sale' && totalPayments < total) {
      throw new BadRequestException(
        `El pago (${totalPayments.toFixed(2)}) no cubre el total de la venta (${total.toFixed(2)}). ` +
          'Usa el medio de pago "crédito" para registrar saldo pendiente.',
      );
    }
    if (nonCashPaid > total) {
      throw new BadRequestException('Los pagos con tarjeta, transferencia o crédito no pueden superar el total');
    }
    const changeGiven = round2(Math.max(0, totalPayments - total));
    const status = isQuote ? 'quote' : totalPayments >= total ? 'completed' : 'pending';

    // ── Validación previa de stock (la definitiva es atómica dentro de la transacción)
    if (!isQuote && requiredQty.size > 0) {
      const stocks = await this.prisma.inventoryStock.findMany({
        where: { tenantId, branchId: dto.branchId, productId: { in: [...requiredQty.keys()] } },
        select: { productId: true, quantity: true, reserved: true },
      });
      const stockMap = new Map(stocks.map((s) => [s.productId, s]));
      for (const [productId, qty] of requiredQty) {
        const s = stockMap.get(productId);
        const available = Number(s?.quantity ?? 0) - Number(s?.reserved ?? 0);
        if (available < qty) {
          const name = productMap.get(productId)?.name ?? productId;
          throw new BadRequestException(
            `Stock insuficiente para ${name}. Disponible: ${available}, requerido: ${qty}`,
          );
        }
      }
    }

    // ── Persistencia (reintenta si otro cajero tomó el mismo número de venta) ──
    for (let attempt = 1; attempt <= MAX_NUMBER_RETRIES; attempt++) {
      try {
        const sale = await this.prisma.$transaction(
          (tx) =>
            this.persist(tx, {
              dto,
              tenantId,
              soldById,
              currencyId,
              saleType,
              status,
              lines,
              productMap,
              requiredQty,
              subtotal,
              taxAmount,
              globalDiscount,
              total,
              totalPayments,
              changeGiven,
              cashPaid,
            }),
          { timeout: 20_000 },
        );
        await this.invalidateCaches(tenantId);
        return sale;
      } catch (err) {
        const isNumberCollision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          String(err.meta?.['target'] ?? '').includes('sale_number');
        if (isNumberCollision && attempt < MAX_NUMBER_RETRIES) {
          this.logger.warn(`Colisión de número de venta, reintentando (${attempt})`);
          continue;
        }
        throw err;
      }
    }
    throw new BadRequestException('No se pudo generar el número de venta, intenta de nuevo');
  }

  private async persist(
    tx: Prisma.TransactionClient,
    ctx: {
      dto: CreateSaleDto;
      tenantId: string;
      soldById: string;
      currencyId: string;
      saleType: string;
      status: string;
      lines: SaleLineCalculation[];
      productMap: Map<string, { name: string; internalCode: string | null; costPrice: Prisma.Decimal | null }>;
      requiredQty: Map<string, number>;
      subtotal: number;
      taxAmount: number;
      globalDiscount: number;
      total: number;
      totalPayments: number;
      changeGiven: number;
      cashPaid: number;
    },
  ) {
    const { dto, tenantId, soldById, lines, productMap } = ctx;
    const isQuote = ctx.saleType === 'quote';
    const saleNumber = await this.generateSaleNumber(tx, tenantId, isQuote ? 'C' : 'V');

    const sale = await tx.sale.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        clientId: dto.clientId,
        currencyId: ctx.currencyId,
        cashRegisterSessionId: dto.cashRegisterSessionId,
        saleNumber,
        type: ctx.saleType,
        status: ctx.status,
        customerName: dto.customerName,
        customerIdType: dto.customerIdType,
        customerIdNum: dto.customerIdNum,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        subtotal: ctx.subtotal,
        taxAmount: ctx.taxAmount,
        discount: ctx.globalDiscount,
        total: ctx.total,
        amountPaid: Math.min(ctx.totalPayments, ctx.total),
        changeGiven: ctx.changeGiven,
        notes: dto.notes,
        soldById,
        items: {
          create: lines.map((l, idx) => ({
            productId: l.productId,
            productName: productMap.get(l.productId)?.name ?? '',
            productCode: productMap.get(l.productId)?.internalCode ?? null,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            discount: l.discount,
            subtotal: l.total,
            notes: dto.items[idx]?.notes,
          })),
        },
        payments: {
          create: (isQuote ? [] : dto.payments ?? []).map((p) => ({
            tenantId,
            type: p.type,
            amount: p.amount,
            reference: p.reference,
            status: p.type === 'credit' ? 'pending' : 'completed',
            processedById: soldById,
          })),
        },
      },
      include: { items: true, payments: true },
    });

    if (isQuote) return sale;

    // Descuento de inventario atómico: respeta las unidades reservadas
    for (const [productId, qty] of ctx.requiredQty) {
      const stock = await tx.inventoryStock.findFirst({
        where: { tenantId, productId, branchId: dto.branchId },
        select: { id: true, quantity: true },
      });
      if (!stock) {
        throw new BadRequestException(`Stock insuficiente para ${productMap.get(productId)?.name ?? productId}`);
      }

      const updated = await tx.$executeRaw`
        UPDATE inventory_stock
           SET quantity = quantity - ${qty}, updated_at = NOW()
         WHERE id = ${stock.id}
           AND quantity - reserved >= ${qty}`;
      if (updated === 0) {
        throw new BadRequestException(
          `Stock insuficiente para ${productMap.get(productId)?.name ?? productId} (modificado por otra operación). Reintenta.`,
        );
      }

      const stockBefore = Number(stock.quantity);
      await tx.inventoryMovement.create({
        data: {
          tenantId,
          productId,
          branchId: dto.branchId,
          type: 'sale_out',
          quantity: qty,
          direction: -1,
          stockBefore,
          stockAfter: stockBefore - qty,
          unitCost: productMap.get(productId)?.costPrice ?? undefined,
          referenceType: 'sale',
          referenceId: sale.id,
          performedById: soldById,
        },
      });
    }

    // Ingreso financiero por lo efectivamente cobrado (el crédito queda como saldo pendiente)
    const collected = round2(
      (dto.payments ?? []).filter((p) => p.type !== 'credit').reduce((s, p) => s + p.amount, 0) -
        ctx.changeGiven,
    );
    if (collected > 0) {
      const currency = await tx.currency.findUnique({
        where: { id: ctx.currencyId },
        select: { code: true },
      });
      await tx.financialTransaction.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          type: 'income',
          description: `Venta #${saleNumber}`,
          amount: collected,
          currency: currency?.code ?? 'COP',
          referenceType: 'sale',
          referenceId: sale.id,
          transactionDate: new Date(),
          createdById: soldById,
        },
      });
    }

    // En caja solo entra el efectivo neto (efectivo recibido − cambio entregado)
    const netCash = round2(ctx.cashPaid - ctx.changeGiven);
    if (dto.cashRegisterSessionId && netCash > 0) {
      await this.cashRegisterUseCase.addMovement(
        dto.cashRegisterSessionId,
        tenantId,
        'sale',
        netCash,
        `Venta #${saleNumber}`,
        soldById,
        'sale',
        sale.id,
        tx,
      );
    }

    if (dto.clientId) {
      await tx.client.updateMany({
        where: { id: dto.clientId, tenantId },
        data: { totalSales: { increment: ctx.total }, lastActivityAt: new Date() },
      });
    }

    return sale;
  }

  private async generateSaleNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    prefix: 'V' | 'C',
  ): Promise<string> {
    const year = new Date().getFullYear();
    const base = `${prefix}${year}-`;
    const last = await tx.sale.findFirst({
      where: { tenantId, saleNumber: { startsWith: base } },
      orderBy: { saleNumber: 'desc' },
      select: { saleNumber: true },
    });
    const lastNum = last ? parseInt(last.saleNumber.slice(base.length), 10) || 0 : 0;
    return `${base}${String(lastNum + 1).padStart(6, '0')}`;
  }

  private async invalidateCaches(tenantId: string): Promise<void> {
    await Promise.all([
      this.cache.invalidatePattern(`INV_STOCK:${tenantId}:*`),
      this.cache.invalidatePattern(`INV_LOW_STOCK:${tenantId}:*`),
      this.cache.invalidatePattern(`ANALYTICS_*:${tenantId}:*`),
    ]);
  }
}
