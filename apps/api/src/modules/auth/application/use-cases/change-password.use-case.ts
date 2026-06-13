import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../../database/prisma.service';
import { LogoutUseCase } from './logout.use-case';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  async execute(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!dbUser) throw new UnauthorizedException();

    const isValid = await argon2.verify(dbUser.passwordHash, currentPassword);
    if (!isValid) throw new UnauthorizedException('Contraseña actual incorrecta');

    const newHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });
    await this.logoutUseCase.revokeAllSessions(userId);
  }
}
