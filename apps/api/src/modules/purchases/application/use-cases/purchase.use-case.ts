import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { parsePaginationParams, paginate } from '../../../../common/utils/pagination.util';
import type { Prisma } from '@prisma/client';

export interface CreatePurchaseOrderDto {
  branchId: string;
  supplierId: string;
  clientId?: string;
  currencyId?: string;
  expectedDate?: string;
  paymentTerms?: number;
  notes?: string;
  items: Array<{
    productId: string;
    quantityOrdered: number;
    unitCost: number;
    taxRate?: number;
    discountRate?: number;
    location?: string;
    notes?: string;
  }>;
}

export interface ReceiveItemsDto {
  items: Array<{ purchaseOrderItemId: string; quantityReceived: number; location?: string }>;
  notes?: string;
}

@Injectable()
export class PurchaseUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePurchaseOrderDto, tenantId: string, createdById: string) {
    const currencyId = dto.currencyId ?? (
      await this.prisma.tenantCurrency.findFirst({
        where: { tenantId, isDefault: true },
      })
    )?.currencyId;

    if (!currencyId) throw new BadRequestException('No hay divisa configurada');

    let subtotal = 0, taxAmount = 0;
    const itemsData = dto.items.map((item) => {
      const gross = item.quantityOrdered * item.unitCost;
      const discount = gross * (item.discountRate ?? 0);
      const net = gross - discount;
      const tax = net * (item.taxRate ?? 0);
      subtotal += net;
      taxAmount += tax;
      return {
        productId: item.productId,
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
        taxRate: item.taxRate ?? 0,
        discountRate: item.discountRate ?? 0,
        subtotal: net + tax,
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
        total: subtotal + taxAmount,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        paymentTerms: dto.paymentTerms,
        notes: dto.notes,
        createdById,
        items: { create: itemsData },
      },
      include: { items: true, supplier: { select: { name: true } } },
    });
  }

  async receiveItems(
    purchaseOrderId: string,
    tenantId: string,
    dto: ReceiveItemsDto,
    receivedById: string,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        tenantId,
        status: { in: ['sent', 'confirmed', 'partial_received'] },
      },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada o ya recibida');

    const validItems = dto.items
      .map((received) => ({ received, orderItem: order.items.find((i) => i.id === received.purchaseOrderItemId) }))
      .filter((x): x is { received: typeof dto.items[0]; orderItem: NonNullable<typeof x.orderItem> } => !!x.orderItem);

    for (const { received, orderItem } of validItems) {
      const newReceived = Number(orderItem.quantityReceived) + received.quantityReceived;
      if (newReceived > Number(orderItem.quantityOrdered)) {
        throw new BadRequestException(
          `No se puede recibir más de lo pedido para el ítem ${orderItem.productId}`,
        );
      }
    }

    const productIds = validItems.map(({ orderItem }) => orderItem.productId);
    const existingStocks = await this.prisma.inventoryStock.findMany({
      where: { tenantId, branchId: order.branchId, productId: { in: productIds } },
    });
    const stockMap = new Map(existingStocks.map((s) => [s.productId, s]));

    return this.prisma.$transaction(async (tx) => {
      const movementsData: Prisma.InventoryMovementCreateManyInput[] = [];

      for (const { received, orderItem } of validItems) {
        const newReceived = Number(orderItem.quantityReceived) + received.quantityReceived;
        await tx.purchaseOrderItem.update({
          where: { id: orderItem.id },
          data: { quantityReceived: newReceived },
        });

        let stock = stockMap.get(orderItem.productId);
        const stockBefore = Number(stock?.quantity ?? 0);
        const newQty = stockBefore + received.quantityReceived;

        if (!stock) {
          stock = await tx.inventoryStock.create({
            data: {
              tenantId,
              productId: orderItem.productId,
              branchId: order.branchId,
              quantity: newQty,
              reserved: 0,
              location: received.location,
            },
          });
          stockMap.set(orderItem.productId, stock);
        } else {
          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { quantity: newQty, ...(received.location ? { location: received.location } : {}) },
          });
          stockMap.set(orderItem.productId, { ...stock, quantity: newQty as unknown as typeof stock.quantity });
        }

        movementsData.push({
          tenantId,
          productId: orderItem.productId,
          branchId: order.branchId,
          type: 'purchase_in',
          quantity: received.quantityReceived,
          direction: 1,
          stockBefore,
          stockAfter: newQty,
          unitCost: orderItem.unitCost,
          referenceType: 'purchase_order',
          referenceId: purchaseOrderId,
          notes: dto.notes,
          performedById: receivedById,
        });
      }

      if (movementsData.length > 0) {
        await tx.inventoryMovement.createMany({ data: movementsData });
      }

      const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId } });
      const allReceived = allItems.every((i) => Number(i.quantityReceived) >= Number(i.quantityOrdered));
      const anyReceived = allItems.some((i) => Number(i.quantityReceived) > 0);
      const newStatus = allReceived ? 'received' : anyReceived ? 'partial_received' : 'sent';

      return tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: newStatus, ...(allReceived ? { receivedDate: new Date() } : {}) },
        include: { items: true },
      });
    });
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
    const last = await this.prisma.purchaseOrder.findFirst({
      where: { tenantId, orderNumber: { startsWith: `OC${year}-` } },
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true },
    });
    const lastNum = last?.orderNumber ? parseInt(last.orderNumber.split('-')[1] ?? '0', 10) : 0;
    return `OC${year}-${String(lastNum + 1).padStart(6, '0')}`;
  }

  // createWithRetry kept as P2002 safeguard in case of simultaneous inserts
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
