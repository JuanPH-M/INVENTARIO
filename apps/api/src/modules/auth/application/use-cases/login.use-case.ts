import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../../../cache/cache-keys.constant';
import type { LoginDto } from '../dtos/login.dto';
import type { TokenResponse } from '@inventario/types';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const INVALID_CREDENTIALS = 'Credenciales inválidas';

export type LoginResult =
  | { type: 'success'; data: TokenResponse }
  | { type: 'mfa_required'; mfaToken: string };

type DurationString = `${number}${'s' | 'm' | 'h' | 'd'}`;

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly cacheService: CacheService,
    private readonly config: ConfigService,
  ) {}

  async execute(dto: LoginDto, ipAddress: string, userAgent: string): Promise<LoginResult> {
    const email = dto.email.toLowerCase();

    // El email es único por empresa, no globalmente: si existe en varias empresas
    // se pide el código de la empresa para desambiguar.
    const candidates = await this.prisma.user.findMany({
      where: {
        email,
        deletedAt: null,
        ...(dto.tenantSlug ? { tenant: { slug: dto.tenantSlug } } : {}),
      },
      include: {
        tenant: { select: { id: true, status: true, planId: true, deletedAt: true } },
        userRoles: {
          where: { OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }] },
          include: { role: { select: { slug: true } } },
        },
      },
      take: 2,
    });

    if (candidates.length > 1) {
      throw new BadRequestException({
        message: 'Este email pertenece a varias empresas. Indica el código de tu empresa.',
        code: 'TENANT_REQUIRED',
      });
    }

    const user = candidates[0];
    if (!user) {
      await this.trackFailedAttempt(ipAddress);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.tenant.status !== 'active' || user.tenant.deletedAt) {
      throw new UnauthorizedException('Esta empresa está suspendida. Contacta al administrador');
    }

    if (user.status === 'locked') {
      // lockedUntil nulo = bloqueo manual hecho por un administrador
      if (!user.lockedUntil || user.lockedUntil > new Date()) {
        const minutesLeft = user.lockedUntil
          ? Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
          : null;
        throw new UnauthorizedException(
          minutesLeft
            ? `Cuenta bloqueada temporalmente. Intenta de nuevo en ${minutesLeft} minuto(s)`
            : 'Cuenta bloqueada. Contacta al administrador',
        );
      }
    } else if (user.status !== 'active') {
      throw new UnauthorizedException('Cuenta inactiva o suspendida. Contacta al administrador');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      await this.trackFailedAttempt(ipAddress);
      const attempts = user.failedLoginAttempts + 1;
      const willLock = attempts >= MAX_FAILED_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: willLock ? 0 : attempts,
          ...(willLock
            ? { status: 'locked', lockedUntil: new Date(Date.now() + LOCK_DURATION_MINUTES * 60_000) }
            : {}),
        },
      });
      throw new UnauthorizedException(
        willLock
          ? `Demasiados intentos fallidos. Cuenta bloqueada por ${LOCK_DURATION_MINUTES} minutos`
          : INVALID_CREDENTIALS,
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        ...(user.status === 'locked' ? { status: 'active', lockedUntil: null } : {}),
      },
    });

    if (user.mfaEnabled && user.mfaSecret) {
      const mfaToken = uuidv4();
      await this.cacheService.set(
        `mfa:pending:${mfaToken}`,
        { userId: user.id, tenantId: user.tenant.id },
        300,
      );
      return { type: 'mfa_required', mfaToken };
    }

    const roles = user.userRoles.map((ur) => ur.role.slug);
    const tokens = await this.generateTokens(
      user.id,
      user.tenant.id,
      null,
      roles,
      userAgent,
      ipAddress,
      user.email,
    );
    return { type: 'success', data: tokens };
  }

  async generateTokens(
    userId: string,
    tenantId: string,
    branchId: string | null,
    roles: string[],
    userAgent: string,
    ipAddress: string,
    email = '',
  ): Promise<TokenResponse> {
    const sessionId = uuidv4();
    const expiresIn = this.config.get<string>('jwt.expiresIn') ?? '15m';
    const payload = { sub: userId, tenantId, branchId, roles, sessionId, email };

    // Algoritmo y clave vienen de la configuración de JwtModule (RS256 o HS256 en desarrollo)
    const accessToken = this.jwtService.sign(payload, { expiresIn: expiresIn as DurationString });

    const refreshTokenRaw = crypto.randomBytes(64).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshTokenHash,
        // sessionId permite revocar también el access token al cerrar sesión
        deviceInfo: { userAgent, sessionId },
        ipAddress,
        expiresAt: new Date(Date.now() + this.refreshTokenTtlMs),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      expiresIn: this.parseDuration(expiresIn) / 1000,
      tokenType: 'Bearer',
    };
  }

  get refreshTokenTtlMs(): number {
    return this.parseDuration(this.config.get<string>('jwt.refreshTokenExpiresIn') ?? '7d');
  }

  get accessTokenTtlSeconds(): number {
    return this.parseDuration(this.config.get<string>('jwt.expiresIn') ?? '15m') / 1000;
  }

  private async trackFailedAttempt(ip: string): Promise<void> {
    const key = CACHE_KEYS.RATE_LIMIT_LOGIN(ip);
    await this.cacheService.increment(key);
    await this.cacheService.expire(key, CACHE_TTL.RATE_LIMIT);
  }

  private parseDuration(duration: string): number {
    const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match || !match[1] || !match[2]) return 15 * 60 * 1000;
    return parseInt(match[1], 10) * (units[match[2]] ?? 60_000);
  }
}
