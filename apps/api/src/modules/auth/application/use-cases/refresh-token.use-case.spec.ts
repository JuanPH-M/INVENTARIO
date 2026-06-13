import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenUseCase } from './refresh-token.use-case';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { LoginUseCase } from './login.use-case';

const USER_ID = 'user-1';
const TENANT_ID = 'tenant-1';
const RAW_TOKEN = 'raw-token-value';
const IP = '127.0.0.1';
const UA = 'test-agent';

function makeStoredToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rt-1',
    userId: USER_ID,
    tokenHash: 'computed-by-usecase',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600_000),
    user: {
      status: 'active',
      tenant: { id: TENANT_ID, status: 'active' },
      userRoles: [{ role: { slug: 'admin_general' } }],
    },
    ...overrides,
  };
}

describe('RefreshTokenUseCase', () => {
  let useCase: RefreshTokenUseCase;
  let prisma: {
    refreshToken: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let loginUseCase: { generateTokens: jest.Mock };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    loginUseCase = {
      generateTokens: jest.fn().mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 900,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: {} },
        { provide: LoginUseCase, useValue: loginUseCase },
      ],
    }).compile();

    useCase = module.get(RefreshTokenUseCase);
  });

  it('throws UnauthorizedException when token not found', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('detects stolen token (revokedAt set) and revokes all sessions', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(
      makeStoredToken({ revokedAt: new Date() }),
    );

    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID, revokedAt: null }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it('throws UnauthorizedException for expired token', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(
      makeStoredToken({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when user is not active', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(
      makeStoredToken({ user: { status: 'suspended', tenant: { id: TENANT_ID }, userRoles: [] } }),
    );

    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rotates the token and returns new tokens on success', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(makeStoredToken());

    const result = await useCase.execute(RAW_TOKEN, IP, UA);

    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rt-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
    expect(loginUseCase.generateTokens).toHaveBeenCalledWith(
      USER_ID,
      TENANT_ID,
      null,
      ['admin_general'],
      UA,
      IP,
    );
    expect(result.accessToken).toBe('new-access');
  });
});
