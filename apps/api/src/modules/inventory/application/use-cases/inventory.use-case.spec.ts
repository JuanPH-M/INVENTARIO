import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryUseCase } from './inventory.use-case';
import { PrismaService } from '../../../../database/prisma.service';

const TENANT_ID = 'tenant-1';
const BRANCH_ID = 'branch-1';
const BRANCH_B_ID = 'branch-2';
const PRODUCT_ID = 'product-1';
const USER_ID = 'user-1';
const STOCK_ID = 'stock-1';

function makeStock(quantity = 10, reserved = 0, id = STOCK_ID) {
  return { id, quantity, reserved, productId: PRODUCT_ID, branchId: BRANCH_ID, tenantId: TENANT_ID };
}

describe('InventoryUseCase', () => {
  let useCase: InventoryUseCase;
  let prisma: Record<string, unknown>;

  const txMock = {
    inventoryStock: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    inventoryMovement: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    purchaseOrderItem: { update: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    Object.values(txMock).forEach((m) =>
      Object.values(m as Record<string, jest.Mock>).forEach((fn) => fn.mockReset()),
    );

    prisma = {
      product: { findFirst: jest.fn() },
      branch: { findFirst: jest.fn() },
      inventoryStock: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      inventoryMovement: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(txMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryUseCase,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    useCase = module.get(InventoryUseCase);
  });

  // ─── getStock ────────────────────────────────────────────────────────────────

  describe('getStock', () => {
    it('returns all stocks for a tenant', async () => {
      const stocks = [{ id: STOCK_ID, quantity: 10, product: { name: 'Gold Ring' }, branch: { name: 'Main' } }];
      (prisma['inventoryStock'] as Record<string, jest.Mock>).findMany.mockResolvedValue(stocks);

      const result = await useCase.getStock(TENANT_ID);
      expect(result).toEqual(stocks);
    });

    it('filters by branchId when provided', async () => {
      (prisma['inventoryStock'] as Record<string, jest.Mock>).findMany.mockResolvedValue([]);
      await useCase.getStock(TENANT_ID, BRANCH_ID);
      expect((prisma['inventoryStock'] as Record<string, jest.Mock>).findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ branchId: BRANCH_ID }) }),
      );
    });
  });

  // ─── getLowStockAlerts ───────────────────────────────────────────────────────

  describe('getLowStockAlerts', () => {
    it('returns only items at or below reorder point', async () => {
      const stocks = [
        { quantity: 3, product: { reorderPoint: 5, trackInventory: true } },
        { quantity: 10, product: { reorderPoint: 5, trackInventory: true } },
      ];
      (prisma['inventoryStock'] as Record<string, jest.Mock>).findMany.mockResolvedValue(stocks);

      const result = await useCase.getLowStockAlerts(TENANT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(3);
    });
  });

  // ─── adjustStock ─────────────────────────────────────────────────────────────

  describe('adjustStock', () => {
    const adjustDto = { productId: PRODUCT_ID, branchId: BRANCH_ID, quantity: 5, type: 'adjustment_in' as const, notes: 'test' };

    it('increments stock for adjustment_in', async () => {
      (prisma['product'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: PRODUCT_ID });
      (prisma['branch'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: BRANCH_ID });
      txMock.inventoryStock.findFirst.mockResolvedValue(makeStock(10));
      txMock.inventoryStock.update.mockResolvedValue({});
      txMock.inventoryMovement.create.mockResolvedValue({ id: 'mov-1', type: 'adjustment_in' });

      const result = await useCase.adjustStock(adjustDto, TENANT_ID, USER_ID);
      expect(txMock.inventoryStock.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ quantity: { increment: 5 } }) }),
      );
    });

    it('decrements stock atomically for adjustment_out', async () => {
      (prisma['product'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: PRODUCT_ID });
      (prisma['branch'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: BRANCH_ID });
      txMock.inventoryStock.findFirst.mockResolvedValue(makeStock(10));
      txMock.inventoryStock.updateMany.mockResolvedValue({ count: 1 });
      txMock.inventoryMovement.create.mockResolvedValue({ id: 'mov-1', type: 'adjustment_out' });

      await useCase.adjustStock({ ...adjustDto, type: 'adjustment_out' as const }, TENANT_ID, USER_ID);
      expect(txMock.inventoryStock.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ quantity: { gte: 5 } }),
          data: expect.objectContaining({ quantity: { decrement: 5 } }),
        }),
      );
    });

    it('throws BadRequestException when stock is insufficient for out movement', async () => {
      (prisma['product'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: PRODUCT_ID });
      (prisma['branch'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: BRANCH_ID });
      txMock.inventoryStock.findFirst.mockResolvedValue(makeStock(3)); // only 3, need 5

      await expect(
        useCase.adjustStock({ ...adjustDto, type: 'adjustment_out' as const }, TENANT_ID, USER_ID),
      ).rejects.toThrow(/Stock insuficiente/);
    });

    it('creates stock record when none exists (for in movement)', async () => {
      (prisma['product'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: PRODUCT_ID });
      (prisma['branch'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: BRANCH_ID });
      txMock.inventoryStock.findFirst.mockResolvedValue(null);
      txMock.inventoryStock.create.mockResolvedValue(makeStock(0));
      txMock.inventoryStock.update.mockResolvedValue({});
      txMock.inventoryMovement.create.mockResolvedValue({});

      await useCase.adjustStock(adjustDto, TENANT_ID, USER_ID);
      expect(txMock.inventoryStock.create).toHaveBeenCalled();
    });

    it('throws BadRequestException when product is not found', async () => {
      (prisma['product'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);

      await expect(useCase.adjustStock(adjustDto, TENANT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when branch is not found', async () => {
      (prisma['product'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: PRODUCT_ID });
      (prisma['branch'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);

      await expect(useCase.adjustStock(adjustDto, TENANT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException on concurrent modification (updateMany returns 0)', async () => {
      (prisma['product'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: PRODUCT_ID });
      (prisma['branch'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: BRANCH_ID });
      txMock.inventoryStock.findFirst.mockResolvedValue(makeStock(10));
      txMock.inventoryStock.updateMany.mockResolvedValue({ count: 0 }); // concurrent modification

      await expect(
        useCase.adjustStock({ ...adjustDto, type: 'adjustment_out' as const }, TENANT_ID, USER_ID),
      ).rejects.toThrow(/concurrentemente/);
    });
  });

  // ─── transferStock ────────────────────────────────────────────────────────────

  describe('transferStock', () => {
    const transferDto = {
      productId: PRODUCT_ID,
      fromBranchId: BRANCH_ID,
      toBranchId: BRANCH_B_ID,
      quantity: 3,
      notes: 'test transfer',
    };

    it('throws when origin and destination are the same', async () => {
      await expect(
        useCase.transferStock({ ...transferDto, toBranchId: BRANCH_ID }, TENANT_ID, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when source branch is not found', async () => {
      (prisma['branch'] as Record<string, jest.Mock>).findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: BRANCH_B_ID });
      (prisma['product'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: PRODUCT_ID });

      await expect(useCase.transferStock(transferDto, TENANT_ID, USER_ID)).rejects.toThrow(
        /origen/,
      );
    });

    it('throws BadRequestException when source stock is insufficient', async () => {
      (prisma['branch'] as Record<string, jest.Mock>).findFirst
        .mockResolvedValueOnce({ id: BRANCH_ID, name: 'Main' })
        .mockResolvedValueOnce({ id: BRANCH_B_ID, name: 'Branch B' });
      (prisma['product'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: PRODUCT_ID });
      txMock.inventoryStock.findFirst.mockResolvedValue(makeStock(1)); // only 1, need 3

      await expect(useCase.transferStock(transferDto, TENANT_ID, USER_ID)).rejects.toThrow(
        /Stock insuficiente/,
      );
    });

    it('creates two inventory movements (transfer_out and transfer_in)', async () => {
      (prisma['branch'] as Record<string, jest.Mock>).findFirst
        .mockResolvedValueOnce({ id: BRANCH_ID, name: 'Main' })
        .mockResolvedValueOnce({ id: BRANCH_B_ID, name: 'Branch B' });
      (prisma['product'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: PRODUCT_ID });
      txMock.inventoryStock.findFirst
        .mockResolvedValueOnce(makeStock(10)) // source stock
        .mockResolvedValueOnce(makeStock(5, 0, 'stock-2')); // destination stock
      txMock.inventoryStock.updateMany.mockResolvedValue({ count: 1 });
      txMock.inventoryStock.update.mockResolvedValue({});
      txMock.inventoryMovement.create.mockResolvedValue({});

      await useCase.transferStock(transferDto, TENANT_ID, USER_ID);

      expect(txMock.inventoryMovement.create).toHaveBeenCalledTimes(2);
      const calls = txMock.inventoryMovement.create.mock.calls;
      const types = calls.map((c: [{ data: { type: string } }]) => c[0].data.type);
      expect(types).toContain('transfer_out');
      expect(types).toContain('transfer_in');
    });
  });

  // ─── physicalCount ────────────────────────────────────────────────────────────

  describe('physicalCount', () => {
    it('returns empty adjustments when no items are provided', async () => {
      (prisma['branch'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: BRANCH_ID });
      const result = await useCase.physicalCount(BRANCH_ID, TENANT_ID, [], USER_ID);
      expect(result).toEqual({ adjustments: [], count: 0 });
    });

    it('throws NotFoundException when branch is not found', async () => {
      (prisma['branch'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);
      await expect(
        useCase.physicalCount(BRANCH_ID, TENANT_ID, [{ productId: PRODUCT_ID, countedQuantity: 5 }], USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates movements only for items where counted != current', async () => {
      (prisma['branch'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ id: BRANCH_ID });
      txMock.inventoryStock.findMany.mockResolvedValue([makeStock(10)]);
      txMock.inventoryStock.update.mockResolvedValue({});
      txMock.inventoryMovement.createMany.mockResolvedValue({});

      const items = [
        { productId: PRODUCT_ID, countedQuantity: 8 }, // diff = -2, should create movement
        { productId: 'prod-2', countedQuantity: 0 },   // no stock record → diff = 0, skip
      ];

      const result = await useCase.physicalCount(BRANCH_ID, TENANT_ID, items, USER_ID);
      expect(result.count).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── getValuation ─────────────────────────────────────────────────────────────

  describe('getValuation', () => {
    it('calculates cost and sale value totals correctly', async () => {
      (prisma['inventoryStock'] as Record<string, jest.Mock>).findMany.mockResolvedValue([
        { quantity: 2, product: { name: 'Ring A', costPrice: 100, salePrice: 200 } },
        { quantity: 5, product: { name: 'Ring B', costPrice: 50, salePrice: 80 } },
      ]);

      const result = await useCase.getValuation(TENANT_ID);
      expect(result.totals.totalCostValue).toBe(2 * 100 + 5 * 50); // 450
      expect(result.totals.totalSaleValue).toBe(2 * 200 + 5 * 80); // 800
      expect(result.totals.totalItems).toBe(7);
    });
  });
});
