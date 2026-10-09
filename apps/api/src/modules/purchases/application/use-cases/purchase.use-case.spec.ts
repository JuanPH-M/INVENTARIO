import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchaseUseCase } from './purchase.use-case';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';

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
    items: [{ productId: PRODUCT_ID, quantityOrdered: 10, unitCost: 50, taxRate: 0.19, discountRate: 0 }],
    ...overrides,
  };
}

function makeOrder(overrides = {}) {
  return {
    id: ORDER_ID,
    branchId: BRANCH_ID,
    tenantId: TENANT_ID,
    status: 'sent',
    items: [{ id: ITEM_ID, productId: PRODUCT_ID, quantityOrdered: 10, quantityReceived: 0, unitCost: 50 }],
    ...overrides,
  };
}

describe('PurchaseUseCase', () => {
  let useCase: PurchaseUseCase;
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let cache: { invalidatePattern: jest.Mock };

  beforeEach(async () => {
    tx = {
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue(makeOrder()),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: ORDER_ID, ...data })),
      },
      purchaseOrderItem: { findMany: jest.fn().mockResolvedValue([{ quantityOrdered: 10, quantityReceived: 10 }]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      inventoryStock: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 5 }),
        upsert: jest.fn().mockResolvedValue({ quantity: 15 }),
      },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
      product: {
        findUnique: jest.fn().mockResolvedValue({ costPrice: 40, inventoryStock: [{ quantity: 15 }] }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    prisma = {
      branch: { count: jest.fn().mockResolvedValue(1) },
      supplier: { count: jest.fn().mockResolvedValue(1) },
      product: { count: jest.fn().mockResolvedValue(1) },
      client: { count: jest.fn().mockResolvedValue(1) },
      tenantCurrency: { findFirst: jest.fn().mockResolvedValue({ currencyId: CURRENCY_ID }) },
      purchaseOrder: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: ORDER_ID, ...data })),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx)),
    };
    cache = { invalidatePattern: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    useCase = module.get(PurchaseUseCase);
  });

  describe('create', () => {
    it('creates a draft purchase order with correct totals', async () => {
      const order = await useCase.create(makeOrderDto(), TENANT_ID, USER_ID);
      expect(order).toMatchObject({ status: 'draft', subtotal: 500, taxAmount: 95, total: 595 });
    });

    it('applies the discount before tax', async () => {
      const order = await useCase.create(
        makeOrderDto({ items: [{ productId: PRODUCT_ID, quantityOrdered: 10, unitCost: 100, taxRate: 0.19, discountRate: 0.1 }] }),
        TENANT_ID,
        USER_ID,
      );
      expect(order).toMatchObject({ subtotal: 900, taxAmount: 171, total: 1071 });
    });

    it('generates the next yearly order number', async () => {
      const year = new Date().getFullYear();
      prisma.purchaseOrder.findFirst.mockResolvedValue({ orderNumber: `OC${year}-000009` });
      const order = await useCase.create(makeOrderDto(), TENANT_ID, USER_ID);
      expect(order.orderNumber).toBe(`OC${year}-000010`);
    });

    it('requires a currency', async () => {
      prisma.tenantCurrency.findFirst.mockResolvedValue(null);
      await expect(useCase.create(makeOrderDto({ currencyId: undefined }), TENANT_ID, USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an empty order', async () => {
      await expect(useCase.create(makeOrderDto({ items: [] }), TENANT_ID, USER_ID)).rejects.toThrow(/al menos un producto/);
    });

    it.each([
      ['branch', 'Sucursal no encontrada'],
      ['supplier', 'Proveedor no encontrado'],
      ['product', 'Uno o más productos no existen'],
    ])('rejects a %s from another company', async (model, message) => {
      prisma[model].count.mockResolvedValue(0);
      await expect(useCase.create(makeOrderDto(), TENANT_ID, USER_ID)).rejects.toThrow(message);
    });
  });

  describe('receiveItems', () => {
    const receiveDto = { items: [{ purchaseOrderItemId: ITEM_ID, quantityReceived: 10 }] };

    it('fails when the order is missing or already received', async () => {
      tx.purchaseOrder.findFirst.mockResolvedValue(null);
      await expect(useCase.receiveItems(ORDER_ID, TENANT_ID, receiveDto, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects items from another order', async () => {
      await expect(
        useCase.receiveItems(ORDER_ID, TENANT_ID, { items: [{ purchaseOrderItemId: 'x', quantityReceived: 1 }] }, USER_ID),
      ).rejects.toThrow(/no pertenece/);
    });

    it('never receives more than ordered (conditional update)', async () => {
      tx.$executeRaw.mockResolvedValue(0);
      await expect(useCase.receiveItems(ORDER_ID, TENANT_ID, receiveDto, USER_ID)).rejects.toThrow(/más de lo pedido/);
    });

    it('increments stock atomically and logs the movement', async () => {
      await useCase.receiveItems(ORDER_ID, TENANT_ID, receiveDto, USER_ID);

      expect(tx.inventoryStock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ quantity: { increment: 10 } }) }),
      );
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'purchase_in', quantity: 10, stockBefore: 5, stockAfter: 15 }),
        }),
      );
      expect(cache.invalidatePattern).toHaveBeenCalledWith(`INV_STOCK:${TENANT_ID}:*`);
    });

    it('updates the weighted average cost', async () => {
      await useCase.receiveItems(ORDER_ID, TENANT_ID, receiveDto, USER_ID);
      // (5 und × 40 + 10 und × 50) / 15 = 46.6667
      expect(tx.product.update).toHaveBeenCalledWith({ where: { id: PRODUCT_ID }, data: { costPrice: 46.6667 } });
    });

    it('marks the order as received when everything arrived', async () => {
      const result = await useCase.receiveItems(ORDER_ID, TENANT_ID, receiveDto, USER_ID);
      expect(result.status).toBe('received');
    });

    it('marks the order as partially received otherwise', async () => {
      tx.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: 10, quantityReceived: 4 }]);
      const result = await useCase.receiveItems(
        ORDER_ID, TENANT_ID, { items: [{ purchaseOrderItemId: ITEM_ID, quantityReceived: 4 }] }, USER_ID,
      );
      expect(result.status).toBe('partial_received');
    });
  });

  describe('createWithRetry', () => {
    it('retries on P2002 and succeeds', async () => {
      const spy = jest
        .spyOn(useCase, 'create')
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValueOnce({ id: ORDER_ID } as never);
      await expect(useCase.createWithRetry(makeOrderDto(), TENANT_ID, USER_ID)).resolves.toEqual({ id: ORDER_ID });
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('gives up after 5 attempts', async () => {
      jest.spyOn(useCase, 'create').mockRejectedValue({ code: 'P2002' });
      await expect(useCase.createWithRetry(makeOrderDto(), TENANT_ID, USER_ID)).rejects.toEqual({ code: 'P2002' });
    });

    it('rethrows other errors immediately', async () => {
      const spy = jest.spyOn(useCase, 'create').mockRejectedValue(new Error('boom'));
      await expect(useCase.createWithRetry(makeOrderDto(), TENANT_ID, USER_ID)).rejects.toThrow('boom');
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
