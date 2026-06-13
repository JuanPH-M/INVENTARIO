import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../../database/prisma.service';

const RESET_TOKEN_EXPIRY_HOURS = 2;

@Injectable()
export class ForgotPasswordUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async requestReset(email: string): Promise<{ token: string; userEmail: string } | null> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, status: true, tenant: { select: { status: true } } },
    });

    if (!user || user.status !== 'active' || user.tenant.status !== 'active') {
      return null;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: expiresAt,
      },
    });

    return { token, userEmail: user.email };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Token inválido o expirado');
    }

    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: 'active',
      },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
