import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../../database/prisma.service';
import { MailService } from '../../../../mail/mail.service';
import { LogoutUseCase } from './logout.use-case';

const RESET_TOKEN_EXPIRY_MINUTES = 60;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  /**
   * Genera un enlace de restablecimiento y lo envía por correo.
   * Nunca revela si el email existe: la respuesta al cliente siempre es la misma.
   * En la base de datos solo se guarda el hash SHA-256 del token.
   */
  async requestReset(email: string): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: {
        email: email.toLowerCase(),
        deletedAt: null,
        status: { in: ['active', 'locked'] },
        tenant: { status: 'active' },
      },
      select: { id: true, email: true, firstName: true, tenant: { select: { name: true } } },
    });

    const webUrl = (this.config.get<string>('app.webUrl') ?? 'http://localhost:3000').split(',')[0]!.trim();

    for (const user of users) {
      const token = crypto.randomBytes(32).toString('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: hashToken(token),
          passwordResetExpires: new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60_000),
        },
      });

      const link = `${webUrl}/reset-password?token=${token}`;
      await this.mail.send({
        to: user.email,
        subject: 'Restablece tu contraseña',
        text: `Hola ${user.firstName}, usa este enlace para restablecer tu contraseña de ${user.tenant.name} (válido ${RESET_TOKEN_EXPIRY_MINUTES} minutos): ${link}`,
        html: this.mail.layout(
          'Restablece tu contraseña',
          `<p>Hola ${user.firstName},</p>
           <p>Recibimos una solicitud para restablecer tu contraseña en <strong>${user.tenant.name}</strong>.</p>
           <p style="margin:24px 0"><a href="${link}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Crear nueva contraseña</a></p>
           <p style="color:#6b7280;font-size:13px">El enlace vence en ${RESET_TOKEN_EXPIRY_MINUTES} minutos. Si no fuiste tú, ignora este mensaje.</p>`,
        ),
      });
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashToken(token),
        passwordResetExpires: { gt: new Date() },
        deletedAt: null,
      },
      select: { id: true, status: true },
    });
    if (!user) throw new BadRequestException('El enlace es inválido o ya expiró');

    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        // Solo se desbloquea un bloqueo por intentos fallidos; no reactiva cuentas suspendidas
        ...(user.status === 'locked' ? { status: 'active', lockedUntil: null } : {}),
      },
    });

    await this.logoutUseCase.revokeAllSessions(user.id);
  }
}
