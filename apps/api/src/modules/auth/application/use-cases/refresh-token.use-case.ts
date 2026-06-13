import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { LoginUseCase } from './login.use-case';
import type { TokenResponse } from '@inventario/types';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  async execute(
    rawToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<TokenResponse> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: {
        user: {
          include: {
            tenant: { select: { id: true, status: true } },
            userRoles: {
              where: { OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }] },
              include: { role: { select: { slug: true } } },
            },
          },
        },
      },
    });

    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(
        'Token robado detectado. Todas las sesiones han sido cerradas',
      );
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    if (stored.user.status !== 'active') {
      throw new UnauthorizedException(`Cuenta ${stored.user.status}`);
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const roles = stored.user.userRoles.map((ur) => ur.role.slug);
    return this.loginUseCase.generateTokens(
      stored.userId,
      stored.user.tenant.id,
      null,
      roles,
      userAgent,
      ipAddress,
    );
  }
}
