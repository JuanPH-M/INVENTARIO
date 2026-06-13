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
let branchBId: string;
let userId: string;
let productId: string;
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
    data: { name: 'Inv E2E Plan', slug: `inv-e2e-${Date.now()}`, maxUsers: -1, maxBranches: -1, maxProducts: -1 },
  });

  const tenant = await prisma.tenant.create({
    data: { name: `Inv E2E Tenant ${Date.now()}`, slug: `inv-e2e-t-${Date.now()}`, planId: plan.id, status: 'active' },
  });
  tenantId = tenant.id;

  const branch = await prisma.branch.create({
    data: { tenantId, name: 'Main', code: 'MAIN', type: 'physical', isActive: true },
  });
  branchId = branch.id;

  const branchB = await prisma.branch.create({
    data: { tenantId, name: 'Branch B', code: 'BRNB', type: 'physical', isActive: true },
  });
  branchBId = branchB.id;

  const category = await prisma.category.create({
    data: { tenantId, name: 'Joyería', slug: 'joyeria' },
  });

  const product = await prisma.product.create({
    data: {
      tenantId, branchId, categoryId: category.id,
      name: 'Anillo Test', internalCode: `ANI-E2E-${Date.now()}`,
      status: 'active', trackInventory: true,
      costPrice: 50, salePrice: 100, minSalePrice: 80,
      taxRate: 0, taxIncluded: false,
    },
  });
  productId = product.id;

  // Seed initial stock
  await prisma.inventoryStock.create({
    data: { tenantId, productId, branchId, quantity: 100, reserved: 0 },
  });

  const passwordHash = await argon2.hash('TestPass123!', { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      tenantId, email: `inv-e2e-${Date.now()}@test.com`, passwordHash,
      firstName: 'Inv', lastName: 'Admin', status: 'active',
      language: 'es', timezone: 'America/Bogota', emailVerifiedAt: new Date(),
    },
  });
  userId = user.id;

  adminToken = jwtService.sign({
    sub: userId, tenantId, branchId: null,
    roles: ['admin_general'], sessionId: 'inv-e2e-session', email: '',
  });
});

afterAll(async () => {
  await prisma.inventoryMovement.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.inventoryStock.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.product.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.category.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.branch.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
  await app.close();
});

// ─── GET /api/inventory/stock ─────────────────────────────────────────────────

describe('GET /api/inventory/stock', () => {
  it('returns stock list for tenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/inventory/stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const items = res.body.data ?? res.body;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/inventory/stock').expect(401);
  });
});

// ─── POST /api/inventory/adjust ───────────────────────────────────────────────

describe('POST /api/inventory/adjust', () => {
  it('increases stock with adjustment_in', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, branchId, quantity: 10, type: 'adjustment_in', notes: 'E2E test' })
      .expect(201);

    expect(res.body.data?.type ?? res.body.type).toBe('adjustment_in');
  });

  it('decreases stock with adjustment_out', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, branchId, quantity: 5, type: 'adjustment_out' })
      .expect(201);

    expect(res.body.data?.direction ?? res.body.direction).toBe(-1);
  });

  it('returns 400 when stock is insufficient', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, branchId, quantity: 999999, type: 'adjustment_out' })
      .expect(400);
  });

  it('returns 400 for missing required fields', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, branchId })
      .expect(400);
  });
});

// ─── POST /api/inventory/transfer ─────────────────────────────────────────────

describe('POST /api/inventory/transfer', () => {
  it('transfers stock between branches', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, fromBranchId: branchId, toBranchId: branchBId, quantity: 5, notes: 'E2E transfer' })
      .expect(201);

    const mov = res.body.data ?? res.body;
    expect(mov.type).toBe('transfer_in');
  });

  it('returns 400 when same branch is used for origin and destination', async () => {
    await request(app.getHttpServer())
      .post('/api/inventory/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, fromBranchId: branchId, toBranchId: branchId, quantity: 5 })
      .expect(400);
  });
});

// ─── GET /api/inventory/movements ─────────────────────────────────────────────

describe('GET /api/inventory/movements', () => {
  it('returns paginated movement history', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/inventory/movements')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('total');
  });

  it('filters movements by productId', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/movements?productId=${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body.data ?? res.body;
    if (body.items.length > 0) {
      expect(body.items.every((m: { productId: string }) => m.productId === productId)).toBe(true);
    }
  });
});

// ─── GET /api/inventory/low-stock ─────────────────────────────────────────────

describe('GET /api/inventory/low-stock', () => {
  it('returns low stock alerts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/inventory/low-stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data ?? res.body)).toBe(true);
  });
});
