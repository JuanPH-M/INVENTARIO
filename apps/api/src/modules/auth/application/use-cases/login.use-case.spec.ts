import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
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
    tenant: { id: TENANT_ID, status: 'active', planId: 'plan-1', deletedAt: null },
    userRoles: [{ role: { slug: 'admin_general' } }],
    ...overrides,
  };
}

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let prisma: { user: { findMany: jest.Mock; update: jest.Mock }; refreshToken: { create: jest.Mock } };
  let jwtService: { sign: jest.Mock };
  let cacheService: { set: jest.Mock; increment: jest.Mock; expire: jest.Mock };

  const dto = { email: 'admin@test.com', password: 'Secret123' };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn(), update: jest.fn() },
      refreshToken: { create: jest.fn() },
    };
    jwtService = { sign: jest.fn().mockReturnValue('mock-jwt-token') };
    cacheService = { set: jest.fn(), increment: jest.fn(), expire: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: CacheService, useValue: cacheService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              ({ 'jwt.expiresIn': '15m', 'jwt.refreshTokenExpiresIn': '7d' } as Record<string, string>)[key],
            ),
          },
        },
      ],
    }).compile();

    useCase = module.get(LoginUseCase);
    jest.clearAllMocks();
  });

  describe('execute — happy path', () => {
    it('returns tokens on valid credentials and stores a hashed refresh token', async () => {
      prisma.user.findMany.mockResolvedValue([makeUser()]);
      mockArgon2.verify.mockResolvedValue(true);

      const result = await useCase.execute(dto, '127.0.0.1', 'jest');

      expect(result.type).toBe('success');
      if (result.type !== 'success') return;
      expect(result.data.accessToken).toBe('mock-jwt-token');
      expect(result.data.refreshToken).toHaveLength(128);
      expect(result.data.expiresIn).toBe(900);

      const stored = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(stored.tokenHash).not.toBe(result.data.refreshToken);
      expect(stored.deviceInfo.sessionId).toBeDefined();
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: USER_ID, tenantId: TENANT_ID, email: 'admin@test.com', roles: ['admin_general'] }),
        expect.anything(),
      );
    });

    it('resets failed attempts on success', async () => {
      prisma.user.findMany.mockResolvedValue([makeUser({ failedLoginAttempts: 3 })]);
      mockArgon2.verify.mockResolvedValue(true);

      await useCase.execute(dto, '127.0.0.1', 'jest');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 0 }) }),
      );
    });

    it('requires MFA when mfaEnabled is true', async () => {
      prisma.user.findMany.mockResolvedValue([makeUser({ mfaEnabled: true, mfaSecret: 'enc' })]);
      mockArgon2.verify.mockResolvedValue(true);

      const result = await useCase.execute(dto, '127.0.0.1', 'jest');
      expect(result.type).toBe('mfa_required');
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^mfa:pending:/),
        { userId: USER_ID, tenantId: TENANT_ID },
        300,
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('filters by tenant slug when provided', async () => {
      prisma.user.findMany.mockResolvedValue([makeUser()]);
      mockArgon2.verify.mockResolvedValue(true);

      await useCase.execute({ ...dto, tenantSlug: 'acme' }, '127.0.0.1', 'jest');
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenant: { slug: 'acme' }, deletedAt: null }) }),
      );
    });

    it('allows login once a temporary lock has expired', async () => {
      prisma.user.findMany.mockResolvedValue([
        makeUser({ status: 'locked', lockedUntil: new Date(Date.now() - 1000) }),
      ]);
      mockArgon2.verify.mockResolvedValue(true);

      const result = await useCase.execute(dto, '127.0.0.1', 'jest');
      expect(result.type).toBe('success');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'active', lockedUntil: null }) }),
      );
    });
  });

  describe('execute — errors', () => {
    it('asks for the company when the email exists in several tenants', async () => {
      prisma.user.findMany.mockResolvedValue([makeUser(), makeUser({ id: 'other' })]);
      await expect(useCase.execute(dto, '127.0.0.1', 'jest')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws a generic error for unknown email and tracks the attempt', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await expect(useCase.execute(dto, '127.0.0.1', 'jest')).rejects.toThrow('Credenciales inválidas');
      expect(cacheService.increment).toHaveBeenCalled();
    });

    it('rejects suspended tenants', async () => {
      prisma.user.findMany.mockResolvedValue([makeUser({ tenant: { id: TENANT_ID, status: 'suspended', deletedAt: null } })]);
      await expect(useCase.execute(dto, '127.0.0.1', 'jest')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects accounts with an active temporary lock', async () => {
      prisma.user.findMany.mockResolvedValue([
        makeUser({ status: 'locked', lockedUntil: new Date(Date.now() + 10 * 60_000) }),
      ]);
      await expect(useCase.execute(dto, '127.0.0.1', 'jest')).rejects.toThrow(/bloqueada temporalmente/);
      expect(mockArgon2.verify).not.toHaveBeenCalled();
    });

    it('rejects accounts locked manually by an administrator', async () => {
      prisma.user.findMany.mockResolvedValue([makeUser({ status: 'locked', lockedUntil: null })]);
      await expect(useCase.execute(dto, '127.0.0.1', 'jest')).rejects.toThrow(/Contacta al administrador/);
    });

    it.each(['suspended', 'inactive'])('rejects %s accounts', async (status) => {
      prisma.user.findMany.mockResolvedValue([makeUser({ status })]);
      await expect(useCase.execute(dto, '127.0.0.1', 'jest')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('increments failed attempts on wrong password without revealing remaining attempts', async () => {
      prisma.user.findMany.mockResolvedValue([makeUser({ failedLoginAttempts: 1 })]);
      mockArgon2.verify.mockResolvedValue(false);

      await expect(useCase.execute(dto, '127.0.0.1', 'jest')).rejects.toThrow('Credenciales inválidas');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { failedLoginAttempts: 2 } }),
      );
    });

    it('locks the account after 5 failed attempts', async () => {
      prisma.user.findMany.mockResolvedValue([makeUser({ failedLoginAttempts: 4 })]);
      mockArgon2.verify.mockResolvedValue(false);

      await expect(useCase.execute(dto, '127.0.0.1', 'jest')).rejects.toThrow(/bloqueada por 15 minutos/);
      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data.status).toBe('locked');
      expect(data.lockedUntil).toBeInstanceOf(Date);
    });
  });
});
