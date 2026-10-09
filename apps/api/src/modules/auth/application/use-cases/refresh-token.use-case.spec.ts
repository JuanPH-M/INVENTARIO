import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenUseCase } from './refresh-token.use-case';
import { PrismaService } from '../../../../database/prisma.service';
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
    revokedBy: null,
    expiresAt: new Date(Date.now() + 3600_000),
    user: {
      email: 'user@test.com',
      status: 'active',
      deletedAt: null,
      tenant: { id: TENANT_ID, status: 'active' },
      userRoles: [{ role: { slug: 'admin_general' } }],
    },
    ...overrides,
  };
}

describe('RefreshTokenUseCase', () => {
  let useCase: RefreshTokenUseCase;
  let prisma: { refreshToken: { findFirst: jest.Mock; updateMany: jest.Mock } };
  let loginUseCase: { generateTokens: jest.Mock };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    loginUseCase = {
      generateTokens: jest.fn().mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 900,
        tokenType: 'Bearer',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: LoginUseCase, useValue: loginUseCase },
      ],
    }).compile();

    useCase = module.get(RefreshTokenUseCase);
  });

  it('throws when the token does not exist', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('looks the token up by its SHA-256 hash, never the raw value', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toThrow();
    const where = prisma.refreshToken.findFirst.mock.calls[0][0].where;
    expect(where.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(where.tokenHash).not.toBe(RAW_TOKEN);
  });

  it('detects reuse of a revoked token and revokes every session', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(
      makeStoredToken({ revokedAt: new Date(Date.now() - 10 * 60_000), revokedBy: 'rotation' }),
    );

    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toThrow(/revocada/);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, revokedAt: null },
      data: expect.objectContaining({ revokedBy: 'reuse_detected' }),
    });
  });

  it('tolerates a just-rotated token (concurrent tabs) without revoking sessions', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(
      makeStoredToken({ revokedAt: new Date(Date.now() - 2000), revokedBy: 'rotation' }),
    );

    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toThrow('Sesión ya renovada');
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects expired tokens', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(makeStoredToken({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toThrow('Sesión expirada');
  });

  it.each([
    ['suspended user', { status: 'suspended', deletedAt: null, tenant: { id: TENANT_ID, status: 'active' } }],
    ['deleted user', { status: 'active', deletedAt: new Date(), tenant: { id: TENANT_ID, status: 'active' } }],
    ['suspended tenant', { status: 'active', deletedAt: null, tenant: { id: TENANT_ID, status: 'suspended' } }],
  ])('rejects a %s', async (_label, user) => {
    prisma.refreshToken.findFirst.mockResolvedValue(
      makeStoredToken({ user: { email: 'x', userRoles: [], ...user } }),
    );
    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toThrow('Cuenta no disponible');
  });

  it('fails if another request consumed the token first', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(makeStoredToken());
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(useCase.execute(RAW_TOKEN, IP, UA)).rejects.toThrow('Sesión ya renovada');
    expect(loginUseCase.generateTokens).not.toHaveBeenCalled();
  });

  it('rotates the token atomically and issues new tokens', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(makeStoredToken());

    const result = await useCase.execute(RAW_TOKEN, IP, UA);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt-1', revokedAt: null },
      data: expect.objectContaining({ revokedBy: 'rotation' }),
    });
    expect(loginUseCase.generateTokens).toHaveBeenCalledWith(
      USER_ID, TENANT_ID, null, ['admin_general'], UA, IP, 'user@test.com',
    );
    expect(result.accessToken).toBe('new-access');
  });
});
