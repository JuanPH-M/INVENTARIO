import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma.service';

/**
 * Quién puede otorgar cada rol privilegiado:
 * - super_admin (plataforma): solo otro super_admin.
 * - admin_general (dueño de la empresa): un admin_general o un super_admin.
 * Los demás roles los puede asignar cualquiera con permiso users:manage_roles / users:create.
 */
const ROLE_GRANTORS: Record<string, string[]> = {
  super_admin: ['super_admin'],
  admin_general: ['super_admin', 'admin_general'],
};

export async function assertAssignableRole(
  prisma: PrismaService,
  roleId: string,
  tenantId: string,
  requesterRoles: string[],
) {
  const role = await prisma.role.findFirst({
    where: { id: roleId, deletedAt: null, OR: [{ tenantId }, { tenantId: null }] },
    select: { id: true, slug: true, name: true },
  });
  if (!role) throw new NotFoundException('Rol no encontrado');

  const grantors = ROLE_GRANTORS[role.slug];
  if (grantors && !requesterRoles.some((r) => grantors.includes(r))) {
    throw new ForbiddenException(`No tienes autorización para asignar el rol "${role.name}"`);
  }
  return role;
}

export async function assertBranchOfTenant(prisma: PrismaService, branchId: string | undefined | null, tenantId: string) {
  if (!branchId) return;
  const ok = await prisma.branch.count({ where: { id: branchId, tenantId, deletedAt: null } });
  if (!ok) throw new BadRequestException('La sucursal no existe');
}
