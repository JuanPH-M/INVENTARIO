import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateSaleUseCase, calculateLine, round2 } from './create-sale.use-case';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { CashRegisterUseCase } from '../../../cash-register/application/use-cases/cash-register.use-case';
import type { CreateSaleDto } from '../dtos/sale.dto';

const TENANT_ID = 'tenant-1';
const BRANCH_ID = 'branch-1';
const PRODUCT_ID = 'product-1';
const USER_ID = 'user-1';
const CURRENCY_ID = 'currency-1';

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    name: 'Anillo de oro',
    internalCode: 'AN-001',
    taxRate: 0,
    taxIncluded: false,
    minSalePrice: 0,
    trackInventory: true,
    costPrice: 50,
    ...overrides,
  };
}

function makeDto(overrides: Partial<CreateSaleDto> = {}): CreateSaleDto {
  return {
    branchId: BRANCH_ID,
    items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 100 }],
    payments: [{ type: 'cash', amount: 200 }],
    ...overrides,
  } as CreateSaleDto;
}

describe('calculateLine', () => {
  it('adds tax on top of the price when tax is not included', () => {
    const l = calculateLine({ productId: 'p', quantity: 2, unitPrice: 100, taxRate: 0.19, taxIncluded: false });
    expect(l).toMatchObject({ net: 200, tax: 38, total: 238 });
  });

  it('extracts tax from the price when tax is included', () => {
    const l = calculateLine({ productId: 'p', quantity: 1, unitPrice: 119, taxRate: 0.19, taxIncluded: true });
    expect(l).toMatchObject({ net: 100, tax: 19, total: 119 });
  });

  it('applies the line discount before tax', () => {
    const l = calculateLine({ productId: 'p', quantity: 1, unitPrice: 100, discount: 10, taxRate: 0.19, taxIncluded: false });
    expect(l).toMatchObject({ net: 90, tax: 17.1, total: 107.1 });
  });

  it('rejects discounts larger than the line value', () => {
    expect(() =>
      calculateLine({ productId: 'p', quantity: 1, unitPrice: 10, discount: 11, taxRate: 0, taxIncluded: false }),
    ).toThrow(BadRequestException);
  });

  it('rounds money without floating point drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe('CreateSaleUseCase', () => {
  let useCase: CreateSaleUseCase;
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let cashRegister: { addMovement: jest.Mock };
  let cache: { invalidatePattern: jest.Mock };

  beforeEach(async () => {
    tx = {
      sale: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sale-1', ...data })),
      },
      inventoryStock: { findFirst: jest.fn().mockResolvedValue({ id: 'stock-1', quantity: 10 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
      currency: { findUnique: jest.fn().mockResolvedValue({ code: 'COP' }) },
      financialTransaction: { create: jest.fn().mockResolvedValue({}) },
      client: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    prisma = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: BRANCH_ID, isActive: true }) },
      client: { findFirst: jest.fn().mockResolvedValue({ id: 'client-1' }) },
      cashRegisterSession: { findFirst: jest.fn().mockResolvedValue({ branchId: BRANCH_ID }) },
      tenantCurrency: { findFirst: jest.fn().mockResolvedValue({ currencyId: CURRENCY_ID }) },
      product: { findMany: jest.fn().mockResolvedValue([makeProduct()]) },
      inventoryStock: {
        findMany: jest.fn().mockResolvedValue([{ productId: PRODUCT_ID, quantity: 10, reserved: 0 }]),
      },
      $transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx)),
    };
    cashRegister = { addMovement: jest.fn().mockResolvedValue({}) };
    cache = { invalidatePattern: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateSaleUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: CashRegisterUseCase, useValue: cashRegister },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    useCase = module.get(CreateSaleUseCase);
  });

  describe('happy path', () => {
    it('creates a completed sale with correct totals', async () => {
      const sale = await useCase.execute(makeDto(), TENANT_ID, USER_ID);
      const data = tx.sale.create.mock.calls[0][0].data;

      expect(sale.id).toBe('sale-1');
      expect(data).toMatchObject({ status: 'completed', subtotal: 200, taxAmount: 0, total: 200, amountPaid: 200, changeGiven: 0 });
      expect(data.saleNumber).toMatch(/^V\d{4}-000001$/);
    });

    it('decrements stock atomically respecting reserved units and logs the movement', async () => {
      await useCase.execute(makeDto(), TENANT_ID, USER_ID);

      const [sql, ...params] = tx.$executeRaw.mock.calls[0];
      expect((sql as string[]).join('?')).toContain('quantity - reserved >=');
      expect(params).toContain(2);
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'sale_out', quantity: 2, stockBefore: 10, stockAfter: 8 }) }),
      );
    });

    it('records the income net of change given', async () => {
      await useCase.execute(makeDto({ payments: [{ type: 'cash', amount: 250 }] }), TENANT_ID, USER_ID);
      expect(tx.financialTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'income', amount: 200, currency: 'COP' }) }),
      );
      expect(tx.sale.create.mock.calls[0][0].data.changeGiven).toBe(50);
    });

    it('adds only net cash to the cash register, inside the same transaction', async () => {
      await useCase.execute(
        makeDto({ cashRegisterSessionId: 'session-1', payments: [{ type: 'cash', amount: 250 }] }),
        TENANT_ID,
        USER_ID,
      );
      expect(cashRegister.addMovement).toHaveBeenCalledWith(
        'session-1', TENANT_ID, 'sale', 200, expect.any(String), USER_ID, 'sale', 'sale-1', tx,
      );
    });

    it('updates the client accumulated sales scoped to the tenant', async () => {
      await useCase.execute(makeDto({ clientId: 'client-1' }), TENANT_ID, USER_ID);
      expect(tx.client.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'client-1', tenantId: TENANT_ID } }),
      );
    });

    it('allows partial payment via credit and leaves no income for the credit part', async () => {
      await useCase.execute(
        makeDto({ payments: [{ type: 'cash', amount: 50 }, { type: 'credit', amount: 150 }] }),
        TENANT_ID,
        USER_ID,
      );
      expect(tx.financialTransaction.create.mock.calls[0][0].data.amount).toBe(50);
    });

    it('creates quotes without touching stock, finance or payments', async () => {
      await useCase.execute(makeDto({ type: 'quote', payments: [] }), TENANT_ID, USER_ID);
      const data = tx.sale.create.mock.calls[0][0].data;
      expect(data.status).toBe('quote');
      expect(data.saleNumber).toMatch(/^C\d{4}-/);
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(tx.financialTransaction.create).not.toHaveBeenCalled();
    });

    it('does not check or move stock for services (trackInventory=false)', async () => {
      prisma.product.findMany.mockResolvedValue([makeProduct({ trackInventory: false })]);
      await useCase.execute(makeDto(), TENANT_ID, USER_ID);
      expect(prisma.inventoryStock.findMany).not.toHaveBeenCalled();
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('invalidates stock and analytics caches', async () => {
      await useCase.execute(makeDto(), TENANT_ID, USER_ID);
      expect(cache.invalidatePattern).toHaveBeenCalledWith(`INV_STOCK:${TENANT_ID}:*`);
    });
  });

  describe('validation errors', () => {
    it('rejects an unknown branch', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(useCase.execute(makeDto(), TENANT_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a client from another company', async () => {
      prisma.client.findFirst.mockResolvedValue(null);
      await expect(useCase.execute(makeDto({ clientId: 'foreign' }), TENANT_ID, USER_ID)).rejects.toThrow('Cliente no encontrado');
    });

    it('rejects a cash session that belongs to another branch', async () => {
      prisma.cashRegisterSession.findFirst.mockResolvedValue({ branchId: 'other-branch' });
      await expect(
        useCase.execute(makeDto({ cashRegisterSessionId: 's' }), TENANT_ID, USER_ID),
      ).rejects.toThrow(/otra sucursal/);
    });

    it('requires a default currency', async () => {
      prisma.tenantCurrency.findFirst.mockResolvedValue(null);
      await expect(useCase.execute(makeDto(), TENANT_ID, USER_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown or inactive products', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await expect(useCase.execute(makeDto(), TENANT_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects prices below the minimum sale price', async () => {
      prisma.product.findMany.mockResolvedValue([makeProduct({ minSalePrice: 150 })]);
      await expect(useCase.execute(makeDto(), TENANT_ID, USER_ID)).rejects.toThrow(/mínimo permitido/);
    });

    it('rejects payments that do not cover the total', async () => {
      await expect(
        useCase.execute(makeDto({ payments: [{ type: 'cash', amount: 100 }] }), TENANT_ID, USER_ID),
      ).rejects.toThrow(/no cubre el total/);
    });

    it('rejects a global discount larger than the total', async () => {
      await expect(useCase.execute(makeDto({ globalDiscount: 500 }), TENANT_ID, USER_ID)).rejects.toThrow(/descuento global/);
    });

    it('rejects when available stock (minus reserved) is insufficient', async () => {
      prisma.inventoryStock.findMany.mockResolvedValue([{ productId: PRODUCT_ID, quantity: 3, reserved: 2 }]);
      await expect(useCase.execute(makeDto(), TENANT_ID, USER_ID)).rejects.toThrow(/Stock insuficiente/);
    });

    it('aggregates repeated lines of the same product when checking stock', async () => {
      prisma.inventoryStock.findMany.mockResolvedValue([{ productId: PRODUCT_ID, quantity: 3, reserved: 0 }]);
      const dto = makeDto({
        items: [
          { productId: PRODUCT_ID, quantity: 2, unitPrice: 100 },
          { productId: PRODUCT_ID, quantity: 2, unitPrice: 100 },
        ],
        payments: [{ type: 'cash', amount: 400 }],
      });
      await expect(useCase.execute(dto, TENANT_ID, USER_ID)).rejects.toThrow(/requerido: 4/);
    });

    it('fails when stock changed concurrently inside the transaction', async () => {
      tx.$executeRaw.mockResolvedValue(0);
      await expect(useCase.execute(makeDto(), TENANT_ID, USER_ID)).rejects.toThrow(/otra operación/);
    });
  });

  describe('sale number generation', () => {
    it('continues the yearly sequence', async () => {
      const year = new Date().getFullYear();
      tx.sale.findFirst.mockResolvedValue({ saleNumber: `V${year}-000041` });
      await useCase.execute(makeDto(), TENANT_ID, USER_ID);
      expect(tx.sale.create.mock.calls[0][0].data.saleNumber).toBe(`V${year}-000042`);
    });

    it('retries when two cashiers get the same number', async () => {
      const collision = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['tenant_id', 'sale_number'] },
      });
      prisma.$transaction.mockRejectedValueOnce(collision);

      const sale = await useCase.execute(makeDto(), TENANT_ID, USER_ID);
      expect(sale.id).toBe('sale-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });
});
