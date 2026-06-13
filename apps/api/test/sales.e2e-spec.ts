import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe } from '@nestjs/common';
import * as argon2 from 'argon2';

let app: INestApplication;
let prisma: PrismaService;
let tenantId: string;
let branchId: string;
let userId: string;
let productId: string;
let currencyId: string;
let saleId: string;
let adminToken: string;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  prisma = app.get(PrismaService);
  const jwtService = app.get(JwtService);

  const plan = await prisma.plan.findFirst() ?? await prisma.plan.create({
    data: { name: 'Sales E2E Plan', slug: `sales-e2e-${Date.now()}`, maxUsers: -1, maxBranches: -1, maxProducts: -1 },
  });

  const tenant = await prisma.tenant.create({
    data: { name: `Sales E2E Tenant ${Date.now()}`, slug: `sales-e2e-${Date.now()}`, planId: plan.id, status: 'active' },
  });
  tenantId = tenant.id;

  const branch = await prisma.branch.create({
    data: { tenantId, name: 'Tienda Principal', code: 'MAIN', type: 'physical', isActive: true },
  });
  branchId = branch.id;

  const currency = await prisma.currency.findFirst() ?? await prisma.currency.create({
    data: { code: 'COP', name: 'Peso Colombiano', symbol: '$', decimals: 0 },
  });
  currencyId = currency.id;

  await prisma.tenantCurrency.create({
    data: { tenantId, currencyId, isDefault: true, exchangeRate: 1 },
  }).catch(() => {}); // might already exist

  const category = await prisma.category.create({
    data: { tenantId, name: 'Joyería Sales', slug: `joyeria-sales-${Date.now()}` },
  });

  const product = await prisma.product.create({
    data: {
      tenantId, branchId, categoryId: category.id,
      name: 'Collar de Plata', internalCode: `COL-E2E-${Date.now()}`,
      status: 'active', trackInventory: true,
      costPrice: 80, salePrice: 150, minSalePrice: 100,
      taxRate: 0, taxIncluded: false,
    },
  });
  productId = product.id;

  await prisma.inventoryStock.create({
    data: { tenantId, productId, branchId, quantity: 50, reserved: 0 },
  });

  const passwordHash = await argon2.hash('TestPass123!', { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      tenantId, email: `sales-e2e-${Date.now()}@test.com`, passwordHash,
      firstName: 'Sales', lastName: 'Admin', status: 'active',
      language: 'es', timezone: 'America/Bogota', emailVerifiedAt: new Date(),
    },
  });
  userId = user.id;

  adminToken = jwtService.sign({
    sub: userId, tenantId, branchId: null,
    roles: ['admin_general'], sessionId: 'sales-e2e-session', email: '',
  });
});

afterAll(async () => {
  await prisma.salePayment.deleteMany({ where: { sale: { tenantId } } }).catch(() => {});
  await prisma.saleItem.deleteMany({ where: { sale: { tenantId } } }).catch(() => {});
  await prisma.sale.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.inventoryMovement.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.financialTransaction.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.inventoryStock.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.product.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.category.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.tenantCurrency.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.branch.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
  await app.close();
});

// ─── POST /api/sales ──────────────────────────────────────────────────────────

describe('POST /api/sales', () => {
  it('creates a sale and deducts stock', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        branchId,
        currencyId,
        items: [{ productId, quantity: 2, unitPrice: 150, discount: 0 }],
        payments: [{ type: 'cash', amount: 300 }],
      })
      .expect(201);

    const sale = res.body.data ?? res.body;
    expect(sale.saleNumber).toMatch(/^V\d{4}-\d{6}$/);
    expect(sale.status).toBe('completed');
    expect(sale.total).toBeCloseTo(300, 2);
    saleId = sale.id;

    // Verify stock was reduced
    const stock = await prisma.inventoryStock.findFirst({ where: { tenantId, productId, branchId } });
    expect(Number(stock?.quantity)).toBe(48); // 50 - 2
  });

  it('returns 400 when stock is insufficient', async () => {
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        branchId,
        currencyId,
        items: [{ productId, quantity: 99999, unitPrice: 150 }],
        payments: [{ type: 'cash', amount: 9999999 }],
      })
      .expect(400);
  });

  it('returns 400 when price is below minimum', async () => {
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        branchId,
        currencyId,
        items: [{ productId, quantity: 1, unitPrice: 50 }], // below minSalePrice=100
        payments: [{ type: 'cash', amount: 50 }],
      })
      .expect(400);
  });

  it('returns 400 with empty items array', async () => {
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId, currencyId, items: [], payments: [{ type: 'cash', amount: 0 }] })
      .expect(400);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).post('/api/sales').send({}).expect(401);
  });
});

// ─── GET /api/sales ───────────────────────────────────────────────────────────

describe('GET /api/sales', () => {
  it('returns paginated list of sales', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toHaveProperty('items');
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('filters by branchId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/sales?branchId=${branchId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body.data ?? res.body;
    if (body.items.length > 0) {
      expect(body.items.every((s: { branchId: string }) => s.branchId === branchId)).toBe(true);
    }
  });
});

// ─── GET /api/sales/:id ───────────────────────────────────────────────────────

describe('GET /api/sales/:id', () => {
  it('returns sale detail with items and payments', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const sale = res.body.data ?? res.body;
    expect(sale.id).toBe(saleId);
    expect(sale.items).toBeDefined();
    expect(sale.payments).toBeDefined();
  });

  it('returns 404 for non-existent sale', async () => {
    await request(app.getHttpServer())
      .get('/api/sales/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('returns 400 for invalid UUID format', async () => {
    await request(app.getHttpServer())
      .get('/api/sales/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
