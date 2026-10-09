import {
  AlertTriangle,
  BarChart3,
  Box,
  Building2,
  CalendarDays,
  ClipboardList,
  DatabaseBackup,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  RefreshCcw,
  ScanBarcode,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Tags,
  Truck,
  Users,
  UsersRound,
  Wallet,
  Warehouse,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Permiso necesario para ver la opción (si se omite, la ve cualquier usuario) */
  permission?: string;
  keywords?: string[];
};

export type NavGroup = { title: string; items: NavItem[] };

/** Fuente única de navegación: la usan la barra lateral, la paleta de comandos y las migas de pan. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'General',
    items: [
      { label: 'Panel principal', href: '/dashboard', icon: LayoutDashboard, keywords: ['inicio', 'home', 'resumen'] },
      { label: 'Punto de venta', href: '/dashboard/pos', icon: ScanBarcode, permission: 'sales:create', keywords: ['pos', 'caja', 'vender', 'cobrar'] },
      { label: 'Analíticas', href: '/dashboard/analytics', icon: BarChart3, permission: 'analytics:read', keywords: ['graficas', 'estadisticas'] },
      { label: 'Inteligencia', href: '/dashboard/ai', icon: Sparkles, permission: 'ai:read', keywords: ['ia', 'prediccion', 'asistente'] },
      { label: 'Calendario', href: '/dashboard/calendar', icon: CalendarDays, permission: 'calendar:read' },
    ],
  },
  {
    title: 'Inventario',
    items: [
      { label: 'Productos', href: '/dashboard/products', icon: Package, permission: 'products:read', keywords: ['articulos', 'catalogo'] },
      { label: 'Categorías', href: '/dashboard/categories', icon: Tags, permission: 'categories:read' },
      { label: 'Existencias', href: '/dashboard/inventory', icon: Warehouse, permission: 'inventory:read', keywords: ['stock', 'traslados', 'kardex'] },
      { label: 'Activos', href: '/dashboard/assets', icon: Box, permission: 'assets:read', keywords: ['equipos', 'mantenimiento'] },
    ],
  },
  {
    title: 'Comercial',
    items: [
      { label: 'Ventas', href: '/dashboard/sales', icon: ShoppingCart, permission: 'sales:read', keywords: ['facturas'] },
      { label: 'Compras', href: '/dashboard/purchases', icon: Truck, permission: 'purchases:read', keywords: ['ordenes', 'pedidos'] },
      { label: 'Clientes', href: '/dashboard/clients', icon: UsersRound, permission: 'clients:read' },
      { label: 'Proveedores', href: '/dashboard/suppliers', icon: Store, permission: 'suppliers:read' },
      { label: 'Caja', href: '/dashboard/cash-register', icon: Wallet, permission: 'cash_register:read', keywords: ['arqueo', 'apertura', 'cierre'] },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { label: 'Transacciones', href: '/dashboard/finance', icon: Receipt, permission: 'finance:read', keywords: ['ingresos', 'gastos'] },
      { label: 'Documentos', href: '/dashboard/documents', icon: FileText, permission: 'documents:read' },
      { label: 'Reportes', href: '/dashboard/reports', icon: ClipboardList, permission: 'reports:read', keywords: ['pdf', 'excel', 'exportar'] },
      { label: 'Suscripciones', href: '/dashboard/subscriptions', icon: RefreshCcw, permission: 'subscriptions:read', keywords: ['renovaciones'] },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Sucursales', href: '/dashboard/branches', icon: Building2, permission: 'branches:read', keywords: ['sedes', 'tiendas', 'bodegas'] },
      { label: 'Usuarios', href: '/dashboard/users', icon: Users, permission: 'users:read', keywords: ['empleados', 'roles', 'permisos'] },
      { label: 'Incidencias', href: '/dashboard/incidents', icon: AlertTriangle, permission: 'incidents:read', keywords: ['tickets', 'soporte'] },
      { label: 'Auditoría', href: '/dashboard/audit', icon: ShieldCheck, permission: 'audit:read', keywords: ['logs', 'historial'] },
      { label: 'Copias de seguridad', href: '/dashboard/backups', icon: DatabaseBackup, permission: 'backup:read', keywords: ['respaldo', 'backup'] },
      { label: 'Configuración', href: '/dashboard/settings', icon: Settings, keywords: ['empresa', 'perfil'] },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** Opción de navegación que corresponde a la ruta actual (la coincidencia más específica). */
export function findNavItem(pathname: string): NavItem | undefined {
  return [...ALL_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/')) || pathname === item.href);
}
