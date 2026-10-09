import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { PermissionResolverService } from '../../../../common/access/permission-resolver.service';

/** Perfil del usuario autenticado con sus permisos efectivos (mismos que aplica el backend). */
@Injectable()
export class GetProfileUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  async execute(userId: string, tenantId: string, branchId: string | null = null) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      include: {
        tenant: { select: { id: true, name: true, slug: true, logoUrl: true } },
        userRoles: {
          where: { OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }] },
          include: {
            role: { select: { id: true, name: true, slug: true, isSystem: true } },
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    const permissions = await this.permissionResolver.getPermissions(user.id, branchId);
    const roles = [...new Set(user.userRoles.map((ur) => ur.role.slug))];

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      language: user.language,
      timezone: user.timezone,
      lastLoginAt: user.lastLoginAt,
      tenantId: user.tenantId,
      role: roles[0] ?? 'employee',
      roles,
      permissions,
      tenant: user.tenant,
      userRoles: user.userRoles.map((ur) => ({
        roleId: ur.roleId,
        roleName: ur.role.name,
        roleSlug: ur.role.slug,
        branchId: ur.branchId,
        branchName: ur.branch?.name ?? null,
      })),
    };
  }
}
