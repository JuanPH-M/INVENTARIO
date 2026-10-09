import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { parsePaginationParams, paginate } from '../../../../common/utils/pagination.util';
import { OUT_MOVEMENT_TYPES } from '../dtos/inventory.dto';
import type { AdjustStockDto, TransferStockDto, PhysicalCountItemDto, GetMovementsQueryDto } from '../dtos/inventory.dto';
import type { Prisma } from '@prisma/client';

@Injectable()
export class InventoryUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Ejecuta la operación y limpia las cachés de stock afectadas. */
  private async withInvalidation<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const result = await fn();
    await Promise.all([
      this.cache.invalidatePattern(`INV_STOCK:${tenantId}:*`),
      this.cache.invalidatePattern(`INV_LOW_STOCK:${tenantId}:*`),
      this.cache.invalidatePattern(`INV_VALUATION:${tenantId}:*`),
      this.cache.invalidatePattern(`PROD_LIST:${tenantId}:*`),
    ]);
    return result;
  }

  async getStock(tenantId: string, branchId?: string, productId?: string) {
    const key = `INV_STOCK:${tenantId}:${branchId ?? 'all'}:${productId ?? 'all'}`;
    return this.cache.getOrSet(
      key,
      () => this.prisma.inventoryStock.findMany({
        where: {
          tenantId,
          ...(branchId ? { branchId } : {}),
          ...(productId ? { productId } : {}),
        },
        include: {
          product: {
            select: {
              id: true, name: true, internalCode: true, barcode: true,
              minStock: true, maxStock: true, unitOfMeasure: true, images: true,
            },
          },
          branch: { select: { name: true } },
        },
        orderBy: { product: { name: 'asc' } },
      }),
      5,
    );
  }

  async getLowStockAlerts(tenantId: string, branchId?: string) {
    const key = `INV_LOW_STOCK:${tenantId}:${branchId ?? 'all'}`;
    return this.cache.getOrSet(
      key,
      async () => {
        const stocks = await this.prisma.inventoryStock.findMany({
          where: {
            tenantId,
            ...(branchId ? { branchId } : {}),
            product: { trackInventory: true, deletedAt: null },
          },
          include: {
            product: { select: { id: true, name: true, minStock: true, reorderPoint: true, unitOfMeasure: true } },
            branch: { select: { name: true } },
          },
        });
        return stocks.filter((s) => Number(s.quantity) <= Number(s.product.reorderPoint));
      },
      30,
    );
  }

  async adjustStock(dto: AdjustStockDto, tenantId: string, performedById: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    const isOut = OUT_MOVEMENT_TYPES.includes(dto.type);
    const direction = isOut ? -1 : 1;

    return this.withInvalidation(tenantId, () => this.prisma.$transaction(async (tx) => {
      let stock = await tx.inventoryStock.findFirst({
        where: { tenantId, productId: dto.productId, branchId: dto.branchId },
      });

      if (!stock) {
        if (isOut) {
          throw new BadRequestException('Stock insuficiente. Disponible: 0, solicitado: ' + dto.quantity);
        }
        stock = await tx.inventoryStock.create({
          data: { tenantId, productId: dto.productId, branchId: dto.branchId, quantity: 0, reserved: 0 },
        });
      }

      const currentQty = Number(stock.quantity);
      const reservedQty = Number(stock.reserved ?? 0);
      const availableQty = currentQty - reservedQty;

      if (isOut && availableQty < dto.quantity) {
        const detail = reservedQty > 0
          ? ` (${currentQty} en stock, ${reservedQty} reservados, disponible: ${availableQty})`
          : '';
        throw new BadRequestException(`Stock insuficiente${detail}. Solicitado: ${dto.quantity}`);
      }

      // Atomic update — prevents race conditions by checking quantity in the WHERE clause
      if (isOut) {
        const result = await tx.$executeRaw`
          UPDATE inventory_stock
             SET quantity = quantity - ${dto.quantity}, updated_at = NOW()
           WHERE id = ${stock.id} AND quantity - reserved >= ${dto.quantity}`;
        if (result === 0) {
          throw new BadRequestException(
            'Stock insuficiente o modificado concurrentemente. Por favor, reintente la operación.',
          );
        }
      } else {
        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { quantity: { increment: dto.quantity } },
        });
      }

      const stockAfter = currentQty + direction * dto.quantity;

      return tx.inventoryMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          branchId: dto.branchId,
          type: dto.type,
          quantity: dto.quantity,
          direction,
          stockBefore: currentQty,
          stockAfter,
          unitCost: dto.unitCost,
          notes: dto.notes,
          performedById,
        },
      });
    }));
  }

  async transferStock(dto: TransferStockDto, tenantId: string, performedById: string) {
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException('Las sucursales de origen y destino deben ser diferentes');
    }

    const [fromBranch, toBranch, product] = await Promise.all([
      this.prisma.branch.findFirst({ where: { id: dto.fromBranchId, tenantId, deletedAt: null } }),
      this.prisma.branch.findFirst({ where: { id: dto.toBranchId, tenantId, deletedAt: null } }),
      this.prisma.product.findFirst({ where: { id: dto.productId, tenantId, deletedAt: null } }),
    ]);

    if (!fromBranch) throw new NotFoundException('Sucursal de origen no encontrada');
    if (!toBranch) throw new NotFoundException('Sucursal de destino no encontrada');
    if (!product) throw new NotFoundException('Producto no encontrado');

    return this.withInvalidation(tenantId, () => this.prisma.$transaction(async (tx) => {
      const fromStock = await tx.inventoryStock.findFirst({
        where: { tenantId, productId: dto.productId, branchId: dto.fromBranchId },
      });

      const fromQty = Number(fromStock?.quantity ?? 0);
      const reservedQty = Number(fromStock?.reserved ?? 0);
      const availableQty = fromQty - reservedQty;

      if (availableQty < dto.quantity) {
        const detail = reservedQty > 0
          ? ` (${fromQty} en stock, ${reservedQty} reservados, disponible: ${availableQty})`
          : ` Disponible: ${fromQty}`;
        throw new BadRequestException(`Stock insuficiente en ${fromBranch.name}.${detail}. Solicitado: ${dto.quantity}`);
      }

      if (!fromStock) {
        // availableQty would be 0 < dto.quantity (since dto.quantity >= 0.001) — already thrown above
        // This branch is unreachable but kept for type safety
        throw new BadRequestException('Stock insuficiente en la sucursal de origen');
      }

      // Atomic decrement of source stock — prevents race condition
      const fromResult = await tx.$executeRaw`
        UPDATE inventory_stock
           SET quantity = quantity - ${dto.quantity}, updated_at = NOW()
         WHERE id = ${fromStock.id} AND quantity - reserved >= ${dto.quantity}`;
      if (fromResult === 0) {
        throw new BadRequestException(
          'Stock insuficiente o modificado concurrentemente. Por favor, reintente la operación.',
        );
      }

      const newFromQty = fromQty - dto.quantity;

      // Upsert destination stock and increment atomically
      let toStock = await tx.inventoryStock.findFirst({
        where: { tenantId, productId: dto.productId, branchId: dto.toBranchId },
      });
      if (!toStock) {
        toStock = await tx.inventoryStock.create({
          data: { tenantId, productId: dto.productId, branchId: dto.toBranchId, quantity: 0, reserved: 0 },
        });
      }
      const toQtyBefore = Number(toStock.quantity);
      await tx.inventoryStock.update({
        where: { id: toStock.id },
        data: { quantity: { increment: dto.quantity } },
      });
      const newToQty = toQtyBefore + dto.quantity;

      // Two audit records — one per branch
      await tx.inventoryMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          branchId: dto.fromBranchId,
          type: 'transfer_out',
          quantity: dto.quantity,
          direction: -1,
          stockBefore: fromQty,
          stockAfter: newFromQty,
          fromBranchId: dto.fromBranchId,
          toBranchId: dto.toBranchId,
          notes: dto.notes,
          performedById,
        },
      });

      return tx.inventoryMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          branchId: dto.toBranchId,
          type: 'transfer_in',
          quantity: dto.quantity,
          direction: 1,
          stockBefore: toQtyBefore,
          stockAfter: newToQty,
          fromBranchId: dto.fromBranchId,
          toBranchId: dto.toBranchId,
          notes: dto.notes,
          performedById,
        },
      });
    }));
  }

  async physicalCount(
    branchId: string,
    tenantId: string,
    items: PhysicalCountItemDto[],
    performedById: string,
  ) {
    // Validate branch belongs to this tenant before any DB writes
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    if (items.length === 0) return { adjustments: [], count: 0 };

    const productIds = items.map((i) => i.productId);

    return this.withInvalidation(tenantId, () => this.prisma.$transaction(async (tx) => {
      const adjustments: { productId: string; before: number; after: number; diff: number }[] = [];

      // Read stocks INSIDE the transaction to avoid stale data
      const existingStocks = await tx.inventoryStock.findMany({
        where: { tenantId, branchId, productId: { in: productIds } },
      });
      const stockMap = new Map(existingStocks.map((s) => [s.productId, s]));

      const now = new Date();
      const itemsWithDiff = items
        .map((item) => {
          const stock = stockMap.get(item.productId);
          const currentQty = Number(stock?.quantity ?? 0);
          const diff = item.countedQuantity - currentQty;
          return { item, stock, currentQty, diff };
        })
        .filter(({ diff }) => diff !== 0);

      if (itemsWithDiff.length === 0) return { adjustments, count: 0 };

      for (const { item, stock, currentQty } of itemsWithDiff) {
        if (!stock) {
          await tx.inventoryStock.create({
            data: { tenantId, productId: item.productId, branchId, quantity: item.countedQuantity, reserved: 0 },
          });
        } else {
          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: {
              quantity: item.countedQuantity,
              lastCountedAt: now,
              lastCountedById: performedById,
            },
          });
        }

        adjustments.push({
          productId: item.productId,
          before: currentQty,
          after: item.countedQuantity,
          diff: item.countedQuantity - currentQty,
        });
      }

      await tx.inventoryMovement.createMany({
        data: itemsWithDiff.map(({ item, currentQty }) => ({
          tenantId,
          productId: item.productId,
          branchId,
          type: 'physical_count',
          quantity: Math.abs(item.countedQuantity - currentQty),
          direction: item.countedQuantity > currentQty ? 1 : -1,
          stockBefore: currentQty,
          stockAfter: item.countedQuantity,
          notes: `Conteo físico: ajuste de ${currentQty} a ${item.countedQuantity}`,
          performedById,
        })),
      });

      return { adjustments, count: adjustments.length };
    }));
  }

  async getMovements(tenantId: string, query: GetMovementsQueryDto) {
    const { page, limit, skip } = parsePaginationParams(query.page, query.limit);

    const where: Prisma.InventoryMovementWhereInput = {
      tenantId,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            performedAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { performedAt: 'desc' },
        include: {
          product: { select: { name: true, internalCode: true, unitOfMeasure: true } },
          branch: { select: { name: true } },
        },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    const performerIds = [...new Set(rows.map((m) => m.performedById))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: performerIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const items = rows.map((m) => ({
      ...m,
      product: { name: m.product.name, sku: m.product.internalCode ?? '', unit: m.product.unitOfMeasure },
      user: userMap[m.performedById] ?? { firstName: 'Sistema', lastName: '' },
    }));

    return paginate(items, total, page, limit);
  }

  async getValuation(tenantId: string, branchId?: string) {
    const key = `INV_VALUATION:${tenantId}:${branchId ?? 'all'}`;
    return this.cache.getOrSet(key, async () => {
      const stocks = await this.prisma.inventoryStock.findMany({
        where: { tenantId, ...(branchId ? { branchId } : {}) },
        include: { product: { select: { costPrice: true, salePrice: true, name: true } } },
      });

      const result = stocks.map((s) => ({
        productName: s.product.name,
        quantity: Number(s.quantity),
        costPrice: Number(s.product.costPrice),
        salePrice: Number(s.product.salePrice),
        costValue: Number(s.quantity) * Number(s.product.costPrice),
        saleValue: Number(s.quantity) * Number(s.product.salePrice),
      }));

      const totals = result.reduce(
        (acc, r) => ({
          totalCostValue: acc.totalCostValue + r.costValue,
          totalSaleValue: acc.totalSaleValue + r.saleValue,
          totalItems: acc.totalItems + r.quantity,
        }),
        { totalCostValue: 0, totalSaleValue: 0, totalItems: 0 },
      );

      return { items: result, totals };
    }, 60);
  }
}
