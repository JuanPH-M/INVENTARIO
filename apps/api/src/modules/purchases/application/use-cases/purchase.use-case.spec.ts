import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchaseUseCase } from './purchase.use-case';
import { PrismaService } from '../../../../database/prisma.service';

const TENANT_ID = 'tenant-1';
const BRANCH_ID = 'branch-1';
const USER_ID = 'user-1';
const SUPPLIER_ID = 'supplier-1';
const PRODUCT_ID = 'product-1';
const CURRENCY_ID = 'currency-1';
const ORDER_ID = 'order-1';
const ITEM_ID = 'item-1';

function makeOrderDto(overrides = {}) {
  return {
    branchId: BRANCH_ID,
    supplierId: SUPPLIER_ID,
    currencyId: CURRENCY_ID,
    items: [
      {
        productId: PRODUCT_ID,
        quantityOrdered: 10,
        unitCost: 50,
        taxRate: 0.19,
        discountRate: 0,
      },
    ],
    ...overrides,
  };
}

function makeOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    branchId: BRANCH_ID,
    tenantId: TENANT_ID,
    status: 'sent',
    items: [
      {
        id: ITEM_ID,
        productId: PRODUCT_ID,
        quantityOrdered: 10,
        quantityReceived: 0,
        unitCost: 50,
      },
    ],
    ...overrides,
  };
}

describe('PurchaseUseCase', () => {
  let useCase: PurchaseUseCase;
  let prisma: Record<string, unknown>;

  const txMock = {
    purchaseOrderItem: { update: jest.fn(), findMany: jest.fn() },
    inventoryStock: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    inventoryMovement: { createMany: jest.fn() },
    purchaseOrder: { update: jest.fn() },
  };

  beforeEach(async () => {
    Object.values(txMock).forEach((m) =>
      Object.values(m as Record<string, jest.Mock>).forEach((fn) => fn.mockReset()),
    );

    prisma = {
      tenantCurrency: { findFirst: jest.fn() },
      purchaseOrder: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      inventoryStock: { findMany: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(txMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseUseCase,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    useCase = module.get(PurchaseUseCase);
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a purchase order with draft status', async () => {
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).create.mockResolvedValue({
        id: ORDER_ID,
        orderNumber: 'OC2026-000001',
        status: 'draft',
        items: [],
        supplier: { name: 'Proveedor Test' },
      });

      const result = await useCase.create(makeOrderDto(), TENANT_ID, USER_ID);

      expect(result.status).toBe('draft');
      expect((prisma['purchaseOrder'] as Record<string, jest.Mock>).create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'draft', tenantId: TENANT_ID }),
        }),
      );
    });

    it('throws BadRequestException when no currency is configured', async () => {
      (prisma['tenantCurrency'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);
      const dto = makeOrderDto({ currencyId: undefined });

      await expect(useCase.create(dto, TENANT_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('calculates subtotal, tax and total correctly', async () => {
      let capturedData: Record<string, unknown> = {};
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).create.mockImplementation(
        async ({ data }) => { capturedData = data; return { ...data, id: ORDER_ID, items: [], supplier: {} }; },
      );

      await useCase.create(
        makeOrderDto({ items: [{ productId: PRODUCT_ID, quantityOrdered: 10, unitCost: 100, taxRate: 0.19, discountRate: 0 }] }),
        TENANT_ID,
        USER_ID,
      );

      // 10 * 100 = 1000 net, tax = 1000 * 0.19 = 190, total = 1190
      expect(capturedData['subtotal']).toBeCloseTo(1000, 2);
      expect(capturedData['taxAmount']).toBeCloseTo(190, 2);
      expect(capturedData['total']).toBeCloseTo(1190, 2);
    });

    it('applies discount before tax', async () => {
      let capturedData: Record<string, unknown> = {};
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).create.mockImplementation(
        async ({ data }) => { capturedData = data; return { ...data, id: ORDER_ID, items: [], supplier: {} }; },
      );

      await useCase.create(
        makeOrderDto({
          items: [{ productId: PRODUCT_ID, quantityOrdered: 10, unitCost: 100, taxRate: 0.10, discountRate: 0.10 }],
        }),
        TENANT_ID,
        USER_ID,
      );

      // gross = 1000, discount = 100, net = 900, tax = 90, total = 990
      expect(capturedData['subtotal']).toBeCloseTo(900, 2);
      expect(capturedData['taxAmount']).toBeCloseTo(90, 2);
    });

    it('generates order number with correct format', async () => {
      let capturedData: Record<string, unknown> = {};
      const year = new Date().getFullYear();
      // findFirst returns last order → split('-')[1]='000042' → parseInt=42 → +1=43 → 'OC{year}-000043'
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).findFirst.mockResolvedValue({ orderNumber: `OC${year}-000042` });
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).create.mockImplementation(
        async ({ data }) => { capturedData = data; return { ...data, id: ORDER_ID, items: [], supplier: {} }; },
      );

      await useCase.create(makeOrderDto(), TENANT_ID, USER_ID);

      expect(capturedData['orderNumber']).toBe(`OC${year}-000043`);
    });
  });

  // ─── receiveItems ─────────────────────────────────────────────────────────────

  describe('receiveItems', () => {
    const receiveDto = {
      items: [{ purchaseOrderItemId: ITEM_ID, quantityReceived: 5 }],
    };

    it('throws NotFoundException when order is not found or already received', async () => {
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(null);

      await expect(
        useCase.receiveItems(ORDER_ID, TENANT_ID, receiveDto, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when receiving more than ordered', async () => {
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(
        makeOrder({ items: [{ id: ITEM_ID, productId: PRODUCT_ID, quantityOrdered: 3, quantityReceived: 0, unitCost: 50 }] }),
      );
      (prisma['inventoryStock'] as Record<string, jest.Mock>).findMany.mockResolvedValue([]);

      await expect(
        useCase.receiveItems(ORDER_ID, TENANT_ID, { items: [{ purchaseOrderItemId: ITEM_ID, quantityReceived: 5 }] }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates inventory stock and movements when receiving items', async () => {
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(makeOrder());
      (prisma['inventoryStock'] as Record<string, jest.Mock>).findMany.mockResolvedValue([]);

      txMock.inventoryStock.findFirst.mockResolvedValue(null);
      txMock.inventoryStock.create.mockResolvedValue({ id: 'stock-new', quantity: 5 });
      txMock.purchaseOrderItem.update.mockResolvedValue({});
      txMock.inventoryMovement.createMany.mockResolvedValue({});
      txMock.purchaseOrderItem.findMany.mockResolvedValue([
        { quantityOrdered: 10, quantityReceived: 5 },
      ]);
      txMock.purchaseOrder.update.mockResolvedValue({ id: ORDER_ID, status: 'partial_received', items: [] });

      const result = await useCase.receiveItems(ORDER_ID, TENANT_ID, receiveDto, USER_ID);

      expect(txMock.inventoryMovement.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ type: 'purchase_in', quantity: 5, direction: 1 }),
          ]),
        }),
      );
      expect(result.status).toBe('partial_received');
    });

    it('sets status to received when all items are fully received', async () => {
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).findFirst.mockResolvedValue(makeOrder());
      (prisma['inventoryStock'] as Record<string, jest.Mock>).findMany.mockResolvedValue([
        { id: 'stock-1', productId: PRODUCT_ID, quantity: 0 },
      ]);

      txMock.inventoryStock.findFirst.mockResolvedValue({ id: 'stock-1', quantity: 0 });
      txMock.inventoryStock.update.mockResolvedValue({});
      txMock.purchaseOrderItem.update.mockResolvedValue({});
      txMock.inventoryMovement.createMany.mockResolvedValue({});
      txMock.purchaseOrderItem.findMany.mockResolvedValue([
        { quantityOrdered: 10, quantityReceived: 10 }, // fully received
      ]);
      txMock.purchaseOrder.update.mockResolvedValue({ id: ORDER_ID, status: 'received', items: [] });

      const result = await useCase.receiveItems(
        ORDER_ID,
        TENANT_ID,
        { items: [{ purchaseOrderItemId: ITEM_ID, quantityReceived: 10 }] },
        USER_ID,
      );

      expect(result.status).toBe('received');
    });
  });

  // ─── createWithRetry ──────────────────────────────────────────────────────────

  describe('createWithRetry', () => {
    it('retries on P2002 unique constraint violation and succeeds', async () => {
      const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      const success = { id: ORDER_ID, status: 'draft', items: [], supplier: {} };

      (prisma['purchaseOrder'] as Record<string, jest.Mock>).create
        .mockRejectedValueOnce(p2002)
        .mockRejectedValueOnce(p2002)
        .mockResolvedValue(success);

      const result = await useCase.createWithRetry(makeOrderDto(), TENANT_ID, USER_ID);
      expect(result).toMatchObject({ id: ORDER_ID });
      expect((prisma['purchaseOrder'] as Record<string, jest.Mock>).create).toHaveBeenCalledTimes(3);
    });

    it('throws after 5 failed attempts', async () => {
      const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).create.mockRejectedValue(p2002);

      await expect(useCase.createWithRetry(makeOrderDto(), TENANT_ID, USER_ID)).rejects.toThrow();
      expect((prisma['purchaseOrder'] as Record<string, jest.Mock>).create).toHaveBeenCalledTimes(5);
    });

    it('rethrows non-P2002 errors immediately', async () => {
      const genericError = new Error('DB connection failed');
      (prisma['purchaseOrder'] as Record<string, jest.Mock>).create.mockRejectedValue(genericError);

      await expect(useCase.createWithRetry(makeOrderDto(), TENANT_ID, USER_ID)).rejects.toThrow(
        'DB connection failed',
      );
      expect((prisma['purchaseOrder'] as Record<string, jest.Mock>).create).toHaveBeenCalledTimes(1);
    });
  });
});
