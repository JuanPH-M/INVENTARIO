import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateSaleUseCase } from './create-sale.use-case';
import { PrismaService } from '../../../../database/prisma.service';
import { CashRegisterUseCase } from '../../../cash-register/application/use-cases/cash-register.use-case';
import type { CreateSaleDto } from '../dtos/sale.dto';

const TENANT_ID = 'tenant-1';
const BRANCH_ID = 'branch-1';
const USER_ID = 'user-1';
const PRODUCT_ID = 'product-1';
const CURRENCY_ID = 'currency-1';

function makeDto(overrides: Partial<CreateSaleDto> = {}): CreateSaleDto {
  return {
    branchId: BRANCH_ID,
    currencyId: CURRENCY_ID,
    items: [
      {
        productId: PRODUCT_ID,
        quantity: 2,
        unitPrice: 100,
        discount: 0,
      },
    ],
    payments: [{ type: 'cash', amount: 200 }],
    ...overrides,
  } as CreateSaleDto;
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    name: 'Anillo de Oro',
    internalCode: 'AO-001',
    minSalePrice: 0,
    trackInventory: true,
    taxRate: 0,
    taxIncluded: false,
    costPrice: 50,
    status: 'active',
    ...overrides,
  };
}

function makeStock(quantity = 10, reserved = 0) {
  return { id: 'stock-1', quantity, reserved };
}

// tx mock — typed as plain object to avoid jest.Mock type conflicts
interface TxMock {
  product: { findFirst: jest.Mock };
  sale: { create: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
  inventoryStock: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  inventoryMovement: { create: jest.Mock };
  financialTransaction: { create: jest.Mock };
  client: { update: jest.Mock };
  currency: { findUnique: jest.Mock };
}

describe('CreateSaleUseCase', () => {
  let useCase: CreateSaleUseCase;
  let prisma: Record<string, unknown>;
  let cashRegisterUseCase: jest.Mocked<CashRegisterUseCase>;

  const txMock: TxMock = {
    product: { findFirst: jest.fn() },
    sale: { create: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    inventoryStock: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    inventoryMovement: { create: jest.fn() },
    financialTransaction: { create: jest.fn() },
    client: { update: jest.fn() },
    currency: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    const transactionFn = jest.fn().mockImplementation(async (cb) => cb(txMock));

    prisma = {
      branch: { findFirst: jest.fn() },
      tenantCurrency: { findFirst: jest.fn() },
      product: { findFirst: jest.fn() },
      inventoryStock: { findFirst: jest.fn() },
      $transaction: transactionFn,
    };

    // Reset tx mocks
    Object.values(txMock).forEach((m) => {
      if (typeof m === 'object' && m !== null) {
        Object.values(m as Record<string, jest.Mock>).forEach((fn) => fn.mockReset());
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateSaleUseCase,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CashRegisterUseCase,
          useValue: { addMovement: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    useCase = module.get(CreateSaleUseCase);
    cashRegisterUseCase = module.get(CashRegisterUseCase) as jest.Mocked<CashRegisterUseCase>;
  });

  describe('happy path', () => {
    beforeEach(() => {
      ((prisma['branch'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue({ id: BRANCH_ID });
      ((prisma['product'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue(makeProduct());
      ((prisma['inventoryStock'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue(makeStock());

      const product = makeProduct();
      txMock.product.findFirst = jest.fn()
        .mockResolvedValueOnce(product)   // line items loop
        .mockResolvedValueOnce({ trackInventory: true, costPrice: 50 }); // inventory loop
      txMock.sale.count = jest.fn().mockResolvedValue(0);
      txMock.sale.findFirst = jest.fn().mockResolvedValue(null);
      // null → no previous sale → generateSaleNumber produces V{year}-000001
      txMock.inventoryStock.findFirst = jest.fn().mockResolvedValue(makeStock());
      txMock.inventoryStock.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      // count: 1 → atomic update succeeded
      txMock.inventoryStock.update = jest.fn().mockResolvedValue({});
      txMock.inventoryMovement.create = jest.fn().mockResolvedValue({});
      txMock.financialTransaction.create = jest.fn().mockResolvedValue({});
      txMock.currency = { findUnique: jest.fn().mockResolvedValue({ code: 'COP' }) };
      const createdSale = {
        id: 'sale-1',
        saleNumber: 'V2026-000001',
        total: 200,
        items: [],
        payments: [],
      };
      txMock.sale.create = jest.fn().mockResolvedValue(createdSale);
    });

    it('creates a sale and returns it', async () => {
      const result = await useCase.execute(makeDto(), TENANT_ID, USER_ID);
      expect(result).toMatchObject({ id: 'sale-1', saleNumber: 'V2026-000001' });
    });

    it('creates an inventory movement for tracked products', async () => {
      await useCase.execute(makeDto(), TENANT_ID, USER_ID);
      expect(txMock.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'sale_out', quantity: 2, direction: -1 }),
        }),
      );
    });

    it('creates a financial transaction for the sale', async () => {
      await useCase.execute(makeDto(), TENANT_ID, USER_ID);
      expect(txMock.financialTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'income', referenceType: 'sale' }),
        }),
      );
    });

    it('updates client totalSales when clientId is provided', async () => {
      txMock.client.update = jest.fn().mockResolvedValue({});
      await useCase.execute(makeDto({ clientId: 'client-1' }), TENANT_ID, USER_ID);
      expect(txMock.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalSales: { increment: expect.any(Number) } }),
        }),
      );
    });
  });

  describe('validation errors', () => {
    it('throws NotFoundException when branch is not found', async () => {
      ((prisma['branch'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue(null);

      await expect(useCase.execute(makeDto(), TENANT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when no currency is configured', async () => {
      ((prisma['branch'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue({ id: BRANCH_ID });
      // No currencyId in dto and no default currency
      const dto = makeDto({ currencyId: undefined });
      (prisma['tenantCurrency'] as unknown as Record<string, jest.Mock>).findFirst = jest.fn().mockResolvedValue(null);
      // Need to re-provide prisma mock after mutating it
      (prisma['tenantCurrency'] as unknown as { findFirst: jest.Mock }).findFirst = jest
        .fn()
        .mockResolvedValue(null);

      // Reset the module with updated mock
      const module = await Test.createTestingModule({
        providers: [
          CreateSaleUseCase,
          {
            provide: PrismaService,
            useValue: {
              ...prisma,
              tenantCurrency: { findFirst: jest.fn().mockResolvedValue(null) },
            },
          },
          { provide: CashRegisterUseCase, useValue: { addMovement: jest.fn() } },
        ],
      }).compile();

      const uc = module.get(CreateSaleUseCase);
      await expect(uc.execute(dto, TENANT_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when product is not found', async () => {
      ((prisma['branch'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue({ id: BRANCH_ID });
      ((prisma['product'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue(null);

      await expect(useCase.execute(makeDto(), TENANT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when price is below minimum', async () => {
      ((prisma['branch'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue({ id: BRANCH_ID });
      ((prisma['product'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue(
        makeProduct({ minSalePrice: 500 }),
      );

      await expect(useCase.execute(makeDto(), TENANT_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when stock is insufficient', async () => {
      ((prisma['branch'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue({ id: BRANCH_ID });
      ((prisma['product'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue(makeProduct());
      ((prisma['inventoryStock'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue(makeStock(1)); // only 1 in stock, need 2

      await expect(useCase.execute(makeDto(), TENANT_ID, USER_ID)).rejects.toThrow(
        /Stock insuficiente/,
      );
    });

    it('does not check stock for products with trackInventory=false', async () => {
      ((prisma['branch'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue({ id: BRANCH_ID });
      ((prisma['product'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue(
        makeProduct({ trackInventory: false }),
      );

      txMock.product.findFirst = jest.fn().mockResolvedValue({
        name: 'Anillo', internalCode: 'AO-001', taxRate: 0, taxIncluded: false,
      });
      txMock.sale.count = jest.fn().mockResolvedValue(0);
      txMock.sale.findFirst = jest.fn().mockResolvedValue(null);
      txMock.inventoryMovement.create = jest.fn().mockResolvedValue({});
      txMock.financialTransaction.create = jest.fn().mockResolvedValue({});
      txMock.sale.create = jest.fn().mockResolvedValue({ id: 'sale-1', total: 200, items: [], payments: [] });
      txMock.currency = { findUnique: jest.fn().mockResolvedValue({ code: 'COP' }) };

      const result = await useCase.execute(makeDto(), TENANT_ID, USER_ID);
      expect(result).toBeDefined();
      expect((prisma['inventoryStock'] as Record<string, jest.Mock>)['findFirst']).not.toHaveBeenCalled();
    });
  });

  describe('sale number generation', () => {
    it('generates sequential sale numbers', async () => {
      ((prisma['branch'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue({ id: BRANCH_ID });
      ((prisma['product'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue(makeProduct());
      ((prisma['inventoryStock'] as Record<string, jest.Mock>)['findFirst']).mockResolvedValue(makeStock());

      const year = new Date().getFullYear();
      txMock.product.findFirst = jest.fn()
        .mockResolvedValue({ name: 'P', internalCode: null, taxRate: 0, taxIncluded: false });
      txMock.sale.findFirst = jest.fn().mockResolvedValue({ saleNumber: `V${year}-000099` });
      // split('-')[1] = '000099' → parseInt = 99 → +1 = 100 → 'V{year}-000100'
      txMock.inventoryStock.findFirst = jest.fn().mockResolvedValue(makeStock());
      txMock.inventoryStock.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      txMock.inventoryStock.update = jest.fn().mockResolvedValue({});
      txMock.inventoryMovement.create = jest.fn().mockResolvedValue({});
      txMock.financialTransaction.create = jest.fn().mockResolvedValue({});
      txMock.currency = { findUnique: jest.fn().mockResolvedValue({ code: 'COP' }) };
      txMock.sale.create = jest.fn().mockImplementation(async ({ data }) => ({
        id: 'sale-x', saleNumber: data.saleNumber, total: 200, items: [], payments: [],
      }));

      const result = await useCase.execute(makeDto(), TENANT_ID, USER_ID);
      expect(result.saleNumber).toBe(`V${year}-000100`);
    });
  });
});
