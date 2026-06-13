import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { LoginUseCase } from './login.use-case';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';

jest.mock('argon2');

const mockArgon2 = argon2 as jest.Mocked<typeof argon2>;

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'admin@test.com',
    passwordHash: 'hashed-password',
    status: 'active',
    lockedUntil: null,
    failedLoginAttempts: 0,
    mfaEnabled: false,
    mfaSecret: null,
    tenant: { id: TENANT_ID, status: 'active', planId: 'plan-1' },
    userRoles: [{ role: { slug: 'admin_general' } }],
    ...overrides,
  };
}

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let prisma: jest.Mocked<PrismaService>;
  let jwtService: jest.Mocked<JwtService>;
  let cacheService: jest.Mocked<CacheService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginUseCase,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            refreshToken: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-jwt-token') },
        },
        {
          provide: CacheService,
          useValue: {
            set: jest.fn(),
            increment: jest.fn(),
            expire: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                'jwt.expiresIn': '15m',
                'jwt.refreshTokenExpiresIn': '7d',
                'jwt.privateKey': '',
              };
              return map[key] ?? null;
            }),
          },
        },
      ],
    }).compile();

    useCase = module.get(LoginUseCase);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;
    cacheService = module.get(CacheService) as jest.Mocked<CacheService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  describe('execute — happy path', () => {
    it('returns tokens on valid credentials', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(makeUser());
      (mockArgon2.verify as jest.Mock).mockResolvedValue(true);
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      const result = await useCase.execute(
        { email: 'admin@test.com', password: 'ValidPass123!' },
        '127.0.0.1',
        'Jest/Test',
      );

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.data.accessToken).toBe('mock-jwt-token');
        expect(result.data.tokenType).toBe('Bearer');
      }
    });

    it('requires MFA when mfaEnabled is true', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(
        makeUser({ mfaEnabled: true, mfaSecret: 'encrypted-secret' }),
      );
      (mockArgon2.verify as jest.Mock).mockResolvedValue(true);
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (cacheService.set as jest.Mock).mockResolvedValue(undefined);

      const result = await useCase.execute(
        { email: 'admin@test.com', password: 'ValidPass123!' },
        '127.0.0.1',
        'Jest/Test',
      );

      expect(result.type).toBe('mfa_required');
      if (result.type === 'mfa_required') {
        expect(result.mfaToken).toBeDefined();
      }
    });
  });

  describe('execute — errors', () => {
    it('throws UnauthorizedException for unknown email', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (cacheService.increment as jest.Mock).mockResolvedValue(1);
      (cacheService.expire as jest.Mock).mockResolvedValue(undefined);

      await expect(
        useCase.execute({ email: 'nobody@test.com', password: 'x' }, '127.0.0.1', 'ua'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when tenant is suspended', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(
        makeUser({ tenant: { id: TENANT_ID, status: 'suspended', planId: 'plan-1' } }),
      );

      await expect(
        useCase.execute({ email: 'admin@test.com', password: 'x' }, '127.0.0.1', 'ua'),
      ).rejects.toThrow('Esta empresa está suspendida');
    });

    it('throws UnauthorizedException when account is locked and lock is still valid', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(
        makeUser({ status: 'locked', lockedUntil }),
      );

      await expect(
        useCase.execute({ email: 'admin@test.com', password: 'x' }, '127.0.0.1', 'ua'),
      ).rejects.toThrow(/bloqueada/);
    });

    it('throws UnauthorizedException when account is suspended', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(makeUser({ status: 'suspended' }));

      await expect(
        useCase.execute({ email: 'admin@test.com', password: 'x' }, '127.0.0.1', 'ua'),
      ).rejects.toThrow('Cuenta suspendida');
    });

    it('throws UnauthorizedException and increments failed attempts on wrong password', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(makeUser());
      (mockArgon2.verify as jest.Mock).mockResolvedValue(false);
      (cacheService.increment as jest.Mock).mockResolvedValue(1);
      (cacheService.expire as jest.Mock).mockResolvedValue(undefined);
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await expect(
        useCase.execute({ email: 'admin@test.com', password: 'wrong' }, '127.0.0.1', 'ua'),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginAttempts: { increment: 1 } }),
        }),
      );
    });

    it('locks account after 5 failed attempts', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(
        makeUser({ failedLoginAttempts: 4 }),
      );
      (mockArgon2.verify as jest.Mock).mockResolvedValue(false);
      (cacheService.increment as jest.Mock).mockResolvedValue(5);
      (cacheService.expire as jest.Mock).mockResolvedValue(undefined);
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await expect(
        useCase.execute({ email: 'admin@test.com', password: 'wrong' }, '127.0.0.1', 'ua'),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'locked', lockedUntil: expect.any(Date) }),
        }),
      );
    });
  });

  describe('generateTokens', () => {
    it('creates a refresh token record in the database', async () => {
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      await useCase.generateTokens(USER_ID, TENANT_ID, null, ['admin'], 'ua', '127.0.0.1');

      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: USER_ID, tokenHash: expect.any(String) }),
        }),
      );
    });

    it('signs the JWT with the correct payload', async () => {
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

      await useCase.generateTokens(USER_ID, TENANT_ID, 'branch-1', ['vendor'], 'ua', '127.0.0.1');

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: USER_ID, tenantId: TENANT_ID, branchId: 'branch-1' }),
        expect.any(Object),
      );
    });
  });
});
