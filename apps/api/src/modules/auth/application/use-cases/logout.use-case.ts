import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { CACHE_KEYS } from '../../../../cache/cache-keys.constant';
import { PermissionResolverService } from '../../../../common/access/permission-resolver.service';

/** Debe cubrir la vida máxima de un access token (JWT_EXPIRES_IN, 15 min por defecto). */
const BLACKLIST_TTL_SECONDS = 60 * 60;

@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly permissions: PermissionResolverService,
  ) {}

  async execute(userId: string, sessionId: string, refreshToken?: string): Promise<void> {
    await this.cacheService.set(CACHE_KEYS.TOKEN_BLACKLIST(sessionId), true, BLACKLIST_TTL_SECONDS);

    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: 'logout' },
      });
    }

    await this.permissions.invalidate(userId);
  }

  /** Revoca todas las sesiones: refresh tokens y los access tokens que siguen vivos. */
  async revokeAllSessions(userId: string): Promise<void> {
    const active = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { deviceInfo: true },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: 'revoke_all' },
    });

    for (const token of active) {
      const sessionId = (token.deviceInfo as { sessionId?: string } | null)?.sessionId;
      if (sessionId) {
        await this.cacheService.set(CACHE_KEYS.TOKEN_BLACKLIST(sessionId), true, BLACKLIST_TTL_SECONDS);
      }
    }

    await this.permissions.invalidate(userId);
  }
}
