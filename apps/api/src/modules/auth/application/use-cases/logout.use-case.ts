import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { CACHE_KEYS } from '../../../../cache/cache-keys.constant';

@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async execute(
    userId: string,
    sessionId: string,
    refreshToken?: string,
  ): Promise<void> {
    await this.cacheService.set(
      CACHE_KEYS.TOKEN_BLACKLIST(sessionId),
      true,
      60 * 16,
    );

    if (refreshToken) {
      const tokenHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash },
        data: { revokedAt: new Date() },
      });
    }

    await this.cacheService.invalidatePattern(
      CACHE_KEYS.USER_PERMISSIONS_PATTERN(userId),
    );
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.cacheService.invalidatePattern(
      CACHE_KEYS.USER_PERMISSIONS_PATTERN(userId),
    );
  }
}
