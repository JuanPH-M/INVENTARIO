import { Test, TestingModule } from '@nestjs/testing';
import { LogoutUseCase } from './logout.use-case';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

describe('LogoutUseCase', () => {
  let useCase: LogoutUseCase;
  let prisma: { refreshToken: { updateMany: jest.Mock } };
  let cacheService: {
    set: jest.Mock;
    invalidatePattern: jest.Mock;
  };

  beforeEach(async () => {
    prisma = { refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    cacheService = {
      set: jest.fn().mockResolvedValue(undefined),
      invalidatePattern: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogoutUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    useCase = module.get(LogoutUseCase);
  });

  describe('execute', () => {
    it('blacklists the session token in cache', async () => {
      await useCase.execute(USER_ID, SESSION_ID);

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining(SESSION_ID),
        true,
        expect.any(Number),
      );
    });

    it('revokes the refresh token when provided', async () => {
      const rawToken = 'raw-refresh-token-hex';
      await useCase.execute(USER_ID, SESSION_ID, rawToken);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('does NOT call updateMany when no refreshToken is provided', async () => {
      await useCase.execute(USER_ID, SESSION_ID);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('invalidates the user permissions cache', async () => {
      await useCase.execute(USER_ID, SESSION_ID);

      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        expect.stringContaining(USER_ID),
      );
    });
  });

  describe('revokeAllSessions', () => {
    it('revokes all active refresh tokens for the user', async () => {
      await useCase.revokeAllSessions(USER_ID);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER_ID, revokedAt: null }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('invalidates the user permissions cache', async () => {
      await useCase.revokeAllSessions(USER_ID);

      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        expect.stringContaining(USER_ID),
      );
    });
  });
});
