import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();
  return app;
}

export interface TestContext {
  tenantId: string;
  userId: string;
  branchId: string;
  accessToken: string;
}

export async function seedTestTenant(prisma: PrismaService): Promise<TestContext> {
  // Clean up previous test data
  await prisma.$executeRawUnsafe(`
    DELETE FROM users WHERE email = 'e2e-admin@inventario.test'
  `).catch(() => {});

  const plan = await prisma.plan.findFirst() ?? await prisma.plan.create({
    data: { name: 'Test Plan', slug: 'test-plan', maxUsers: -1, maxBranches: -1, maxProducts: -1 },
  });

  const tenant = await prisma.tenant.create({
    data: {
      name: 'E2E Test Company',
      slug: `e2e-test-${Date.now()}`,
      planId: plan.id,
      status: 'active',
    },
  });

  const branch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Main Branch',
      code: 'MAIN',
      type: 'physical',
      isActive: true,
    },
  });

  const passwordHash = await argon2.hash('E2ETestPass123!', { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'e2e-admin@inventario.test',
      passwordHash,
      firstName: 'E2E',
      lastName: 'Admin',
      status: 'active',
      language: 'es',
      timezone: 'America/Bogota',
      emailVerifiedAt: new Date(),
    },
  });

  return {
    tenantId: tenant.id,
    userId: user.id,
    branchId: branch.id,
    accessToken: '', // filled after login
  };
}

export function generateTestToken(jwtService: JwtService, payload: {
  sub: string;
  tenantId: string;
  branchId?: string | null;
  roles?: string[];
}): string {
  return jwtService.sign({
    sub: payload.sub,
    tenantId: payload.tenantId,
    branchId: payload.branchId ?? null,
    roles: payload.roles ?? ['admin_general'],
    sessionId: 'test-session',
    email: '',
  });
}
