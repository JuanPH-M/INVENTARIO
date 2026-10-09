import { Test, TestingModule } from '@nestjs/testing';
import { LogoutUseCase } from './logout.use-case';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { PermissionResolverService } from '../../../../common/access/permission-resolver.service';

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

describe('LogoutUseCase', () => {
  let useCase: LogoutUseCase;
  let prisma: { refreshToken: { updateMany: jest.Mock; findMany: jest.Mock } };
  let cache: { set: jest.Mock };
  let permissions: { invalidate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    cache = { set: jest.fn().mockResolvedValue(undefined) };
    permissions = { invalidate: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogoutUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: PermissionResolverService, useValue: permissions },
      ],
    }).compile();

    useCase = module.get(LogoutUseCase);
  });

  describe('execute', () => {
    it('blacklists the current session for longer than an access token lives', async () => {
      await useCase.execute(USER_ID, SESSION_ID);
      expect(cache.set).toHaveBeenCalledWith(`blacklist:token:${SESSION_ID}`, true, 3600);
    });

    it('revokes the refresh token by its hash', async () => {
      await useCase.execute(USER_ID, SESSION_ID, 'raw-refresh');
      const call = prisma.refreshToken.updateMany.mock.calls[0][0];
      expect(call.where.userId).toBe(USER_ID);
      expect(call.where.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(call.data.revokedBy).toBe('logout');
    });

    it('does not touch refresh tokens when none is provided', async () => {
      await useCase.execute(USER_ID, SESSION_ID);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('invalidates cached permissions', async () => {
      await useCase.execute(USER_ID, SESSION_ID);
      expect(permissions.invalidate).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('revokeAllSessions', () => {
    it('revokes every refresh token and blacklists live access tokens', async () => {
      prisma.refreshToken.findMany.mockResolvedValue([
        { deviceInfo: { sessionId: 's-a' } },
        { deviceInfo: { sessionId: 's-b' } },
        { deviceInfo: null },
      ]);

      await useCase.revokeAllSessions(USER_ID);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, revokedAt: null },
        data: expect.objectContaining({ revokedBy: 'revoke_all' }),
      });
      expect(cache.set).toHaveBeenCalledWith('blacklist:token:s-a', true, 3600);
      expect(cache.set).toHaveBeenCalledWith('blacklist:token:s-b', true, 3600);
      expect(cache.set).toHaveBeenCalledTimes(2);
      expect(permissions.invalidate).toHaveBeenCalledWith(USER_ID);
    });
  });
});
