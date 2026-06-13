import { PrismaClient } from '@prisma/client';
import { SYSTEM_ROLES, ROLE_PERMISSIONS } from '@inventario/shared';

export async function seedRoles(prisma: PrismaClient): Promise<void> {
  const roleDefinitions = [
    {
      slug: SYSTEM_ROLES.SUPER_ADMIN,
      name: 'Super Administrador',
      description: 'Control total de la plataforma SaaS',
      isSystem: true,
    },
    {
      slug: SYSTEM_ROLES.ADMIN_GENERAL,
      name: 'Administrador General',
      description: 'Control total dentro de la empresa',
      isSystem: true,
    },
    {
      slug: SYSTEM_ROLES.BRANCH_ADMIN,
      name: 'Administrador de Sucursal',
      description: 'Control total dentro de su sucursal',
      isSystem: true,
    },
    {
      slug: SYSTEM_ROLES.SUPERVISOR,
      name: 'Supervisor',
      description: 'Supervisión de operaciones diarias',
      isSystem: true,
    },
    {
      slug: SYSTEM_ROLES.INVENTORY_MANAGER,
      name: 'Encargado de Inventario',
      description: 'Gestión especializada del inventario',
      isSystem: true,
    },
    {
      slug: SYSTEM_ROLES.SELLER,
      name: 'Vendedor',
      description: 'Operaciones de punto de venta',
      isSystem: true,
      isDefault: true,
    },
    {
      slug: SYSTEM_ROLES.EMPLOYEE,
      name: 'Empleado',
      description: 'Acceso básico de lectura',
      isSystem: true,
    },
    {
      slug: SYSTEM_ROLES.AUDITOR,
      name: 'Auditor',
      description: 'Acceso de solo lectura para auditorías',
      isSystem: true,
    },
  ];

  for (const roleDef of roleDefinitions) {
    let role = await prisma.role.findFirst({
      where: { slug: roleDef.slug, tenantId: null },
    });
    if (role) {
      role = await prisma.role.update({
        where: { id: role.id },
        data: { name: roleDef.name, description: roleDef.description },
      });
    } else {
      role = await prisma.role.create({
        data: {
          tenantId: null,
          name: roleDef.name,
          slug: roleDef.slug,
          description: roleDef.description,
          isSystem: roleDef.isSystem,
          isDefault: roleDef.isDefault ?? false,
        },
      });
    }

    const permissionSlugs = ROLE_PERMISSIONS[roleDef.slug as keyof typeof ROLE_PERMISSIONS] ?? [];
    if (permissionSlugs.length === 0) continue;

    const permissions = await prisma.permission.findMany({
      where: { slug: { in: permissionSlugs } },
      select: { id: true },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({
        roleId: role.id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });

    console.log(`  → Role "${roleDef.name}": ${permissions.length} permissions`);
  }

  console.log(`✓ Roles seeded (${roleDefinitions.length})`);
}
