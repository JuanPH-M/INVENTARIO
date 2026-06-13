import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as OTPAuth from 'otpauth';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { LoginUseCase } from './login.use-case';
import type { MfaSetupResponse, TokenResponse } from '@inventario/types';

@Injectable()
export class MfaUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly loginUseCase: LoginUseCase,
    private readonly config: ConfigService,
  ) {}

  async setupMfa(userId: string, tenantId: string): Promise<MfaSetupResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { email: true, mfaEnabled: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.mfaEnabled) throw new ConflictException('MFA ya está habilitado');

    const appName = this.config.get<string>('app.mfaAppName') ?? 'Inventario SaaS';
    const totp = new OTPAuth.TOTP({
      issuer: appName,
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    const secret = totp.secret.base32;
    const qrCodeUrl = totp.toString();

    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex'),
    );

    await this.cacheService.set(
      `mfa:setup:${userId}`,
      { secret, backupCodes },
      600,
    );

    return { secret, qrCodeUrl, backupCodes };
  }

  async enableMfa(userId: string, tenantId: string, code: string): Promise<void> {
    const pending = await this.cacheService.get<{ secret: string; backupCodes: string[] }>(
      `mfa:setup:${userId}`,
    );
    if (!pending) throw new BadRequestException('Sesión de configuración MFA expirada');

    if (!this.verifyTotpCode(code, pending.secret)) {
      throw new BadRequestException('Código MFA inválido');
    }

    const hashedCodes = await Promise.all(
      pending.backupCodes.map((c) => argon2.hash(c, { type: argon2.argon2id })),
    );

    const encryptedSecret = this.encryptSecret(pending.secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
        mfaBackupCodes: hashedCodes,
      },
    });

    await this.cacheService.del(`mfa:setup:${userId}`);
  }

  async verifyMfaAndLogin(
    mfaToken: string,
    code: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<TokenResponse> {
    const pending = await this.cacheService.get<{ userId: string; tenantId: string }>(
      `mfa:pending:${mfaToken}`,
    );
    if (!pending) throw new UnauthorizedException('Token MFA expirado o inválido');

    const user = await this.prisma.user.findFirst({
      where: { id: pending.userId },
      include: {
        userRoles: {
          where: { OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }] },
          include: { role: { select: { slug: true } } },
        },
      },
    });
    if (!user || !user.mfaSecret) throw new UnauthorizedException();

    const secret = this.decryptSecret(user.mfaSecret);
    let isValid = this.verifyTotpCode(code, secret);

    if (!isValid && code.length === 8) {
      isValid = await this.verifyBackupCode(user.id, code, user.mfaBackupCodes);
    }

    if (!isValid) throw new UnauthorizedException('Código MFA inválido');

    await this.cacheService.del(`mfa:pending:${mfaToken}`);

    const roles = user.userRoles.map((ur) => ur.role.slug);
    return this.loginUseCase.generateTokens(
      user.id,
      pending.tenantId,
      null,
      roles,
      userAgent,
      ipAddress,
    );
  }

  async disableMfa(userId: string, tenantId: string, code: string, password: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { passwordHash: true, mfaEnabled: true, mfaSecret: true },
    });
    if (!user || !user.mfaEnabled) throw new BadRequestException('MFA no está habilitado');

    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) throw new UnauthorizedException('Contraseña incorrecta');

    const secret = this.decryptSecret(user.mfaSecret ?? '');
    if (!this.verifyTotpCode(code, secret)) {
      throw new BadRequestException('Código MFA inválido');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    });
  }

  private verifyTotpCode(code: string, secret: string): boolean {
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  }

  private async verifyBackupCode(
    userId: string,
    code: string,
    hashedCodes: string[],
  ): Promise<boolean> {
    for (let i = 0; i < hashedCodes.length; i++) {
      const hash = hashedCodes[i];
      if (!hash) continue;
      const isMatch = await argon2.verify(hash, code);
      if (isMatch) {
        const newCodes = [...hashedCodes];
        newCodes[i] = '[USED]';
        await this.prisma.user.update({
          where: { id: userId },
          data: { mfaBackupCodes: newCodes },
        });
        return true;
      }
    }
    return false;
  }

  private encryptSecret(secret: string): string {
    const key = Buffer.from(this.config.get<string>('app.encryptionKey') ?? '0'.repeat(64), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptSecret(encryptedSecret: string): string {
    try {
      const [ivHex, tagHex, dataHex] = encryptedSecret.split(':');
      if (!ivHex || !tagHex || !dataHex) return encryptedSecret;
      const key = Buffer.from(this.config.get<string>('app.encryptionKey') ?? '0'.repeat(64), 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8');
    } catch {
      return encryptedSecret;
    }
  }
}
