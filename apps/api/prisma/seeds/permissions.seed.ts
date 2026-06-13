import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, PERMISSION_MODULES } from '@inventario/shared';

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  const permissionEntries = Object.entries(PERMISSIONS).map(([, slug]) => {
    const parts = slug.split(':');
    const module = parts[0] ?? 'system';
    const action = parts.slice(1).join(':');

    const nameMap: Record<string, string> = {
      read: 'Ver',
      create: 'Crear',
      update: 'Editar',
      delete: 'Eliminar',
      export: 'Exportar',
      import: 'Importar',
      manage: 'Administrar',
    };

    const moduleNameMap: Record<string, string> = {
      auth: 'Autenticación',
      users: 'Usuarios',
      roles: 'Roles',
      companies: 'Empresas',
      branches: 'Sucursales',
      categories: 'Categorías',
      suppliers: 'Proveedores',
      products: 'Productos',
      jewelry: 'Joyería',
      inventory: 'Inventario',
      purchases: 'Compras',
      sales: 'Ventas',
      clients: 'Clientes',
      documents: 'Documentos',
      cash_register: 'Caja Registradora',
      finance: 'Finanzas',
      subscriptions: 'Suscripciones',
      calendar: 'Calendario',
      assets: 'Activos',
      incidents: 'Incidencias',
      notifications: 'Notificaciones',
      reports: 'Reportes',
      analytics: 'Analíticas',
      ai: 'Inteligencia Artificial',
      audit: 'Auditoría',
      currency: 'Divisas',
      backup: 'Backups',
      settings: 'Configuración',
    };

    const moduleName = moduleNameMap[module] ?? module;
    const actionName = nameMap[action.split(':')[0] ?? ''] ?? action;
    const name = `${moduleName} — ${actionName}`;

    return {
      name,
      slug,
      module,
      action,
      description: `Permiso: ${slug}`,
    };
  });

  let count = 0;
  for (const perm of permissionEntries) {
    await prisma.permission.upsert({
      where: { slug: perm.slug },
      update: { name: perm.name, description: perm.description },
      create: perm,
    });
    count++;
  }

  console.log(`✓ Permissions seeded (${count})`);
}
