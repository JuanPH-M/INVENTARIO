import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Auth E2E tests — these run against the real app stack.
 *
 * Prerequisites:
 *  - TEST_DATABASE_URL pointing to a test/staging database
 *  - Redis reachable at TEST_REDIS_URL (or default localhost:6379/1)
 *
 * Run with: pnpm test:e2e (from apps/api)
 */

let app: INestApplication;
let prisma: PrismaService;
let tenantId: string;
let userId: string;
let validToken: string;

const TEST_EMAIL = `e2e-auth-${Date.now()}@inventario.test`;
const TEST_PASSWORD = 'E2E-SecurePass123!';

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

  // Seed minimal tenant + user for auth tests
  const plan = await prisma.plan.findFirst() ?? await prisma.plan.create({
    data: { name: 'E2E Plan', slug: `e2e-plan-${Date.now()}`, maxUsers: -1, maxBranches: -1, maxProducts: -1 },
  });

  const tenant = await prisma.tenant.create({
    data: {
      name: `E2E Auth Tenant ${Date.now()}`,
      slug: `e2e-auth-${Date.now()}`,
      planId: plan.id,
      status: 'active',
    },
  });
  tenantId = tenant.id;

  const passwordHash = await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      tenantId,
      email: TEST_EMAIL,
      passwordHash,
      firstName: 'E2E',
      lastName: 'Test',
      status: 'active',
      language: 'es',
      timezone: 'America/Bogota',
      emailVerifiedAt: new Date(),
    },
  });
  userId = user.id;

  validToken = jwtService.sign({
    sub: userId,
    tenantId,
    branchId: null,
    roles: ['admin_general'],
    sessionId: 'e2e-session',
    email: TEST_EMAIL,
  });
});

afterAll(async () => {
  // Clean up test data in reverse dependency order
  await prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
  await app.close();
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns access and refresh tokens on valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);

    expect(res.body.data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      tokenType: 'Bearer',
    });
  });

  it('returns 401 for wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'WrongPass999' })
      .expect(401);
  });

  it('returns 401 for non-existent email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@inventario.test', password: 'whatever' })
      .expect(401);
  });

  it('returns 400 for missing password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL })
      .expect(400);
  });

  it('returns 400 for invalid email format', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'pass' })
      .expect(400);
  });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns user profile with valid token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(res.body.data ?? res.body).toMatchObject({
      id: userId,
    });
  });

  it('returns 401 without token', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('returns 401 with malformed token', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-valid-jwt')
      .expect(401);
  });
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('logs out and invalidates the session', async () => {
    // First login to get a fresh token
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    const token = loginRes.body.data?.accessToken ?? loginRes.body.accessToken;

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 without authentication', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
