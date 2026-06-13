import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { CashRegisterUseCase } from '../../../cash-register/application/use-cases/cash-register.use-case';
import type { CreateSaleDto } from '../dtos/sale.dto';
import type { Prisma } from '@prisma/client';

@Injectable()
export class CreateSaleUseCase {
  private readonly logger = new Logger(CreateSaleUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cashRegisterUseCase: CashRegisterUseCase,
  ) {}

  async execute(dto: CreateSaleDto, tenantId: string, soldById: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    const currencyId = dto.currencyId ?? (
      await this.prisma.tenantCurrency.findFirst({
        where: { tenantId, isDefault: true },
        select: { currencyId: true },
      })
    )?.currencyId;

    if (!currencyId) throw new BadRequestException('No hay divisa configurada');

    for (const item of dto.items) {
      const product = await this.prisma.product.findFirst({
        where: { id: item.productId, tenantId, deletedAt: null, status: 'active' },
      });
      if (!product) throw new NotFoundException(`Producto ${item.productId} no encontrado`);

      if (Number(product.minSalePrice) > 0 && item.unitPrice < Number(product.minSalePrice)) {
        throw new BadRequestException(
          `El precio de ${product.name} (${item.unitPrice}) es menor al mínimo permitido (${product.minSalePrice})`,
        );
      }

      if (product.trackInventory) {
        const stock = await this.prisma.inventoryStock.findFirst({
          where: { tenantId, productId: item.productId, branchId: dto.branchId },
        });
        const available = Number(stock?.quantity ?? 0) - Number(stock?.reserved ?? 0);
        if (available < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para ${product.name}. Disponible: ${available}, requerido: ${item.quantity}`,
          );
        }
      }
    }

    const totalPayments = dto.payments.reduce((sum, p) => sum + p.amount, 0);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let subtotal = 0;
      let taxAmount = 0;
      const lineItems = [];

      for (const item of dto.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId },
          select: { name: true, internalCode: true, taxRate: true, taxIncluded: true },
        });

        const lineGross = item.quantity * item.unitPrice;
        const lineDiscount = item.discount ?? 0;
        const lineNet = lineGross - lineDiscount;
        const taxRate = Number(product?.taxRate ?? 0);
        const lineTax = product?.taxIncluded ? 0 : lineNet * taxRate;

        subtotal += lineNet;
        taxAmount += lineTax;

        lineItems.push({
          productId: item.productId,
          productName: product?.name ?? '',
          productCode: product?.internalCode ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate,
          discount: lineDiscount,
          subtotal: lineNet + lineTax,
          notes: item.notes,
        });
      }

      const globalDiscount = dto.globalDiscount ?? 0;
      const total = subtotal + taxAmount - globalDiscount;
      const changeGiven = Math.max(0, totalPayments - total);

      const saleNumber = await this.generateSaleNumber(tx, tenantId);

      const sale = await tx.sale.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          clientId: dto.clientId,
          currencyId,
          cashRegisterSessionId: dto.cashRegisterSessionId,
          saleNumber,
          type: dto.type ?? 'sale',
          status: 'completed',
          customerName: dto.customerName,
          customerIdType: dto.customerIdType,
          customerIdNum: dto.customerIdNum,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          subtotal,
          taxAmount,
          discount: globalDiscount,
          total,
          amountPaid: totalPayments,
          changeGiven,
          notes: dto.notes,
          soldById,
          items: { create: lineItems },
          payments: {
            create: dto.payments.map((p) => ({
              tenantId,
              type: p.type,
              amount: p.amount,
              reference: p.reference,
              status: 'completed',
              processedById: soldById,
            })),
          },
        },
        include: { items: true, payments: true },
      });

      for (const item of dto.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId },
          select: { trackInventory: true, costPrice: true },
        });

        if (!product?.trackInventory) continue;

        const stock = await tx.inventoryStock.findFirst({
          where: { tenantId, productId: item.productId, branchId: dto.branchId },
        });
        if (!stock) continue;

        const stockBefore = Number(stock.quantity);

        // Atomic decrement — prevents race condition (same pattern as inventory.use-case.ts adjustStock)
        const updateResult = await tx.inventoryStock.updateMany({
          where: { id: stock.id, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });

        if (updateResult.count === 0) {
          throw new BadRequestException(
            'Stock insuficiente o modificado concurrentemente. Por favor, reintente la operación.',
          );
        }

        const stockAfter = stockBefore - item.quantity;

        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            branchId: dto.branchId,
            type: 'sale_out',
            quantity: item.quantity,
            direction: -1,
            stockBefore,
            stockAfter,
            unitCost: product.costPrice,
            referenceType: 'sale',
            referenceId: sale.id,
            performedById: soldById,
          },
        });
      }

      const currencyRecord = await tx.currency.findUnique({
        where: { id: currencyId },
        select: { code: true },
      });
      if (!currencyRecord) {
        this.logger.warn(`Currency ${currencyId} not found, falling back to 'COP'`);
      }

      await tx.financialTransaction.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          type: 'income',
          description: `Venta #${saleNumber}`,
          amount: total,
          currency: currencyRecord?.code ?? 'COP',
          referenceType: 'sale',
          referenceId: sale.id,
          transactionDate: new Date(),
          createdById: soldById,
        },
      });

      if (dto.cashRegisterSessionId) {
        await this.cashRegisterUseCase.addMovement(
          dto.cashRegisterSessionId,
          tenantId,
          'sale',
          dto.payments.find((p) => p.type === 'cash')?.amount ?? 0,
          `Venta #${saleNumber}`,
          soldById,
          'sale',
          sale.id,
        );
      }

      if (dto.clientId) {
        await tx.client.update({
          where: { id: dto.clientId },
          data: {
            totalSales: { increment: total },
            lastActivityAt: new Date(),
          },
        });
      }

      return sale;
    });
  }

  private async generateSaleNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const last = await tx.sale.findFirst({
      where: { tenantId, saleNumber: { startsWith: `V${year}-` } },
      orderBy: { createdAt: 'desc' },
      select: { saleNumber: true },
    });
    const lastNum = last?.saleNumber ? parseInt(last.saleNumber.split('-')[1] ?? '0', 10) : 0;
    return `V${year}-${String(lastNum + 1).padStart(6, '0')}`;
  }
}
