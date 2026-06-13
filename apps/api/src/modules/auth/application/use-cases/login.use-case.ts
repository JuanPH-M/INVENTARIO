import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
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

export type LoginResult =
  | { type: 'success'; data: TokenResponse }
  | { type: 'mfa_required'; mfaToken: string };

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly cacheService: CacheService,
    private readonly config: ConfigService,
  ) {}

  async execute(dto: LoginDto, ipAddress: string, userAgent: string): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
      include: {
        tenant: { select: { id: true, status: true, planId: true } },
        userRoles: {
          where: { OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }] },
          include: { role: { select: { slug: true } } },
        },
      },
    });

    if (!user) {
      await this.trackFailedAttempt(dto.email, ipAddress);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.tenant.status !== 'active') {
      throw new UnauthorizedException('Esta empresa está suspendida');
    }

    if (user.status === 'locked' && user.lockedUntil) {
      if (user.lockedUntil > new Date()) {
        const minutesLeft = Math.ceil(
          (user.lockedUntil.getTime() - Date.now()) / 60000,
        );
        throw new UnauthorizedException(
          `Cuenta bloqueada. Intenta en ${minutesLeft} minutos`,
        );
      }
    }

    if (user.status === 'suspended') {
      throw new UnauthorizedException('Cuenta suspendida');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      await this.trackFailedAttempt(dto.email, ipAddress);
      const attempts = user.failedLoginAttempts + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: { increment: 1 },
          ...(attempts >= MAX_FAILED_ATTEMPTS
            ? {
                status: 'locked',
                lockedUntil: new Date(
                  Date.now() + LOCK_DURATION_MINUTES * 60 * 1000,
                ),
              }
            : {}),
        },
      });
      throw new UnauthorizedException(
        `Credenciales inválidas. Intentos restantes: ${MAX_FAILED_ATTEMPTS - attempts}`,
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
    const tokens = await this.generateTokens(user.id, user.tenant.id, null, roles, userAgent, ipAddress);

    return { type: 'success', data: tokens };
  }

  async generateTokens(
    userId: string,
    tenantId: string,
    branchId: string | null,
    roles: string[],
    userAgent: string,
    ipAddress: string,
  ): Promise<TokenResponse> {
    const sessionId = uuidv4();
    const expiresIn = this.config.get<string>('jwt.expiresIn') ?? '15m';
    const privateKey = this.config.get<string>('jwt.privateKey');

    const payload = { sub: userId, tenantId, branchId, roles, sessionId, email: '' };

    const signOptions = {
      expiresIn: expiresIn as `${number}${'s'|'m'|'h'|'d'}`,
      ...(privateKey ? { algorithm: 'RS256' as const, privateKey } : {}),
    };

    const accessToken = this.jwtService.sign(payload, signOptions);

    const refreshTokenRaw = crypto.randomBytes(64).toString('hex');
    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(refreshTokenRaw)
      .digest('hex');

    const refreshExpiresIn = this.config.get<string>('jwt.refreshTokenExpiresIn') ?? '7d';
    const refreshExpiresMs = this.parseDuration(refreshExpiresIn);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshTokenHash,
        deviceInfo: { userAgent },
        ipAddress,
        expiresAt: new Date(Date.now() + refreshExpiresMs),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      expiresIn: this.parseDuration(expiresIn) / 1000,
      tokenType: 'Bearer',
    };
  }

  private async trackFailedAttempt(email: string, ip: string): Promise<void> {
    const key = CACHE_KEYS.RATE_LIMIT_LOGIN(ip);
    await this.cacheService.increment(key);
    await this.cacheService.expire(key, CACHE_TTL.RATE_LIMIT);
  }

  private parseDuration(duration: string): number {
    const units: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match || !match[1] || !match[2]) return 15 * 60 * 1000;
    return parseInt(match[1], 10) * (units[match[2]] ?? 60000);
  }
}
