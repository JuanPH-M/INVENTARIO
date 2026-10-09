import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { parsePaginationParams, paginate } from '../../../../common/utils/pagination.util';
import type { Prisma } from '@prisma/client';

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export type { CreatePurchaseOrderDto, ReceiveItemsDto } from '../dtos/purchase.dto';
import type { CreatePurchaseOrderDto, ReceiveItemsDto } from '../dtos/purchase.dto';

@Injectable()
export class PurchaseUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreatePurchaseOrderDto, tenantId: string, createdById: string) {
    if (!dto.items?.length) throw new BadRequestException('La orden debe tener al menos un producto');

    // Todas las referencias deben pertenecer a la misma empresa
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const [branch, supplier, productCount] = await Promise.all([
      this.prisma.branch.count({ where: { id: dto.branchId, tenantId, deletedAt: null } }),
      this.prisma.supplier.count({ where: { id: dto.supplierId, tenantId, deletedAt: null } }),
      this.prisma.product.count({ where: { id: { in: productIds }, tenantId, deletedAt: null } }),
    ]);
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    if (productCount !== productIds.length) throw new NotFoundException('Uno o más productos no existen');
    if (dto.clientId) {
      const client = await this.prisma.client.count({ where: { id: dto.clientId, tenantId, deletedAt: null } });
      if (!client) throw new NotFoundException('Cliente no encontrado');
    }

    const currencyId = dto.currencyId ?? (
      await this.prisma.tenantCurrency.findFirst({
        where: { tenantId, isDefault: true },
      })
    )?.currencyId;

    if (!currencyId) throw new BadRequestException('No hay divisa configurada');

    let subtotal = 0;
    let taxAmount = 0;
    const itemsData = dto.items.map((item) => {
      const gross = round2(item.quantityOrdered * item.unitCost);
      const discount = round2(gross * (item.discountRate ?? 0));
      const net = round2(gross - discount);
      const tax = round2(net * (item.taxRate ?? 0));
      subtotal = round2(subtotal + net);
      taxAmount = round2(taxAmount + tax);
      return {
        productId: item.productId,
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
        taxRate: item.taxRate ?? 0,
        discountRate: item.discountRate ?? 0,
        subtotal: round2(net + tax),
        location: item.location,
        notes: item.notes,
      };
    });

    const orderNumber = await this.generateOrderNumber(tenantId);

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        supplierId: dto.supplierId,
        clientId: dto.clientId,
        currencyId,
        orderNumber,
        status: 'draft',
        subtotal,
        taxAmount,
        total: round2(subtotal + taxAmount),
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        paymentTerms: dto.paymentTerms,
        notes: dto.notes,
        createdById,
        items: { create: itemsData },
      },
      include: { items: true, supplier: { select: { name: true } } },
    });
  }

  /**
   * Recepción de mercancía. Todo ocurre en una transacción con incrementos atómicos,
   * así las ventas simultáneas en la sucursal no "pierden" unidades.
   * También recalcula el costo promedio ponderado del producto.
   */
  async receiveItems(
    purchaseOrderId: string,
    tenantId: string,
    dto: ReceiveItemsDto,
    receivedById: string,
  ) {
    if (!dto.items?.length) throw new BadRequestException('Indica las cantidades recibidas');

    const result = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.purchaseOrder.findFirst({
          where: {
            id: purchaseOrderId,
            tenantId,
            status: { in: ['sent', 'confirmed', 'partial_received'] },
          },
          include: { items: true },
        });
        if (!order) throw new NotFoundException('Orden no encontrada o ya recibida');

        for (const received of dto.items) {
          if (!(received.quantityReceived > 0)) continue;
          const orderItem = order.items.find((i) => i.id === received.purchaseOrderItemId);
          if (!orderItem) throw new BadRequestException('Un ítem no pertenece a esta orden');

          // Incremento condicionado: nunca se recibe más de lo pedido, ni con peticiones concurrentes
          const updated = await tx.$executeRaw`
            UPDATE purchase_order_items
               SET quantity_received = quantity_received + ${received.quantityReceived}
             WHERE id = ${orderItem.id}
               AND quantity_received + ${received.quantityReceived} <= quantity_ordered`;
          if (updated === 0) {
            throw new BadRequestException('No se puede recibir más de lo pedido para uno de los productos');
          }

          const key = {
            tenantId_productId_branchId: { tenantId, productId: orderItem.productId, branchId: order.branchId },
          };
          const before = await tx.inventoryStock.findUnique({ where: key, select: { quantity: true } });
          const stock = await tx.inventoryStock.upsert({
            where: key,
            create: {
              tenantId,
              productId: orderItem.productId,
              branchId: order.branchId,
              quantity: received.quantityReceived,
              reserved: 0,
              location: received.location,
            },
            update: {
              quantity: { increment: received.quantityReceived },
              ...(received.location ? { location: received.location } : {}),
            },
          });

          await tx.inventoryMovement.create({
            data: {
              tenantId,
              productId: orderItem.productId,
              branchId: order.branchId,
              type: 'purchase_in',
              quantity: received.quantityReceived,
              direction: 1,
              stockBefore: Number(before?.quantity ?? 0),
              stockAfter: Number(stock.quantity),
              unitCost: orderItem.unitCost,
              referenceType: 'purchase_order',
              referenceId: purchaseOrderId,
              notes: dto.notes,
              performedById: receivedById,
            },
          });

          // Costo promedio ponderado sobre el stock total de la empresa
          const product = await tx.product.findUnique({
            where: { id: orderItem.productId },
            select: { costPrice: true, inventoryStock: { select: { quantity: true } } },
          });
          if (product) {
            const totalQty = product.inventoryStock.reduce((acc, st) => acc + Number(st.quantity), 0);
            const prevQty = Math.max(0, totalQty - received.quantityReceived);
            const newCost =
              totalQty > 0
                ? (prevQty * Number(product.costPrice ?? 0) +
                    received.quantityReceived * Number(orderItem.unitCost)) /
                  totalQty
                : Number(orderItem.unitCost);
            await tx.product.update({
              where: { id: orderItem.productId },
              data: { costPrice: Math.round(newCost * 10_000) / 10_000 },
            });
          }
        }

        const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId } });
        const allReceived = allItems.every((i) => Number(i.quantityReceived) >= Number(i.quantityOrdered));
        const anyReceived = allItems.some((i) => Number(i.quantityReceived) > 0);
        const newStatus = allReceived ? 'received' : anyReceived ? 'partial_received' : order.status;

        return tx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: { status: newStatus, ...(allReceived ? { receivedDate: new Date() } : {}) },
          include: { items: true },
        });
      },
      { timeout: 30_000 },
    );

    await Promise.all([
      this.cache.invalidatePattern(`INV_STOCK:${tenantId}:*`),
      this.cache.invalidatePattern(`INV_LOW_STOCK:${tenantId}:*`),
      this.cache.invalidatePattern(`INV_VALUATION:${tenantId}:*`),
      this.cache.invalidatePattern(`PROD_LIST:${tenantId}:*`),
    ]);
    return result;
  }

  async findMany(tenantId: string, query: {
    page?: number; limit?: number; branchId?: string;
    supplierId?: string; status?: string; dateFrom?: string; dateTo?: string;
  }) {
    const { page, limit, skip } = parsePaginationParams(query.page, query.limit);
    const where: Prisma.PurchaseOrderWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { name: true } },
          branch: { select: { name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  private async generateOrderNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const base = `OC${year}-`;
    const last = await this.prisma.purchaseOrder.findFirst({
      where: { tenantId, orderNumber: { startsWith: base } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const lastNum = last ? parseInt(last.orderNumber.slice(base.length), 10) || 0 : 0;
    return `${base}${String(lastNum + 1).padStart(6, '0')}`;
  }

  /** Reintenta si dos órdenes simultáneas obtienen el mismo número (violación única P2002). */
  async createWithRetry(dto: CreatePurchaseOrderDto, tenantId: string, createdById: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.create(dto, tenantId, createdById);
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code !== 'P2002' || attempt === 4) throw e;
      }
    }
  }
}
