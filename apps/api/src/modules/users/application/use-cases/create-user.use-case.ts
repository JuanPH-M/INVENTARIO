import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../../database/prisma.service';
import type { CreateUserDto } from '../dtos/user.dto';
import { assertAssignableRole, assertBranchOfTenant } from '../role-policy';

@Injectable()
export class CreateUserUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: CreateUserDto, tenantId: string, createdById: string, requesterRoles: string[] = []) {
    // Valida el rol antes de crear nada: evita asignar roles privilegiados o de otra empresa
    await assertAssignableRole(this.prisma, dto.roleId, tenantId, requesterRoles);
    await assertBranchOfTenant(this.prisma, dto.branchId, tenantId);

    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email en esta empresa');
    }

    await this.checkPlanLimits(tenantId);

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone,
        language: dto.language ?? 'es',
        timezone: dto.timezone ?? 'America/Bogota',
        status: 'active',
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        createdAt: true,
      },
    });

    await this.prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: dto.roleId,
        branchId: dto.branchId ?? null,
        assignedBy: createdById,
      },
    });

    return user;
  }

  private async checkPlanLimits(tenantId: string): Promise<void> {
    const [tenant, userCount] = await Promise.all([
      this.prisma.tenant.findFirst({
        where: { id: tenantId },
        include: { plan: { select: { maxUsers: true } } },
      }),
      this.prisma.user.count({
        where: { tenantId, deletedAt: null },
      }),
    ]);

    if (!tenant) throw new BadRequestException('Empresa no encontrada');
    const maxUsers = tenant.plan?.maxUsers ?? -1;
    if (maxUsers !== -1 && userCount >= maxUsers) {
      throw new BadRequestException(
        `Tu plan permite máximo ${maxUsers} usuarios. Actualiza tu plan para agregar más.`,
      );
    }
  }
}
