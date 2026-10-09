import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../../database/prisma.service';
import { LoginUseCase } from './login.use-case';
import type { TokenResponse } from '@inventario/types';

/**
 * Ventana en la que reutilizar un refresh token recién rotado NO se considera robo.
 * Cubre el caso de dos pestañas que refrescan casi al mismo tiempo.
 */
const ROTATION_GRACE_MS = 30_000;

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  async execute(rawToken: string, ipAddress: string, userAgent: string): Promise<TokenResponse> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

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

    if (!stored) throw new UnauthorizedException('Sesión inválida');

    if (stored.revokedAt) {
      const revokedAgo = Date.now() - stored.revokedAt.getTime();
      if (stored.revokedBy === 'rotation' && revokedAgo < ROTATION_GRACE_MS) {
        throw new UnauthorizedException('Sesión ya renovada');
      }
      // Reutilización de un token revocado: posible robo → cerrar todas las sesiones
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: 'reuse_detected' },
      });
      throw new UnauthorizedException('Sesión revocada. Inicia sesión de nuevo');
    }

    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Sesión expirada');

    const { user } = stored;
    if (user.deletedAt || user.status !== 'active' || user.tenant.status !== 'active') {
      throw new UnauthorizedException('Cuenta no disponible');
    }

    // Rotación atómica: solo una petición concurrente puede consumir el token
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: 'rotation' },
    });
    if (consumed.count === 0) throw new UnauthorizedException('Sesión ya renovada');

    const roles = user.userRoles.map((ur) => ur.role.slug);
    return this.loginUseCase.generateTokens(
      stored.userId,
      user.tenant.id,
      null,
      roles,
      userAgent,
      ipAddress,
      user.email,
    );
  }
}
