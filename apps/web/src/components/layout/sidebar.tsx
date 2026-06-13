'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Box,
  Building2,
  ChevronLeft,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  permission?: string;
};

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Analíticas', href: '/dashboard/analytics', icon: BarChart3, permission: 'analytics:read' },
    ],
  },
  {
    title: 'Inventario',
    items: [
      { label: 'Productos', href: '/dashboard/products', icon: Package, permission: 'products:read' },
      { label: 'Categorías', href: '/dashboard/categories', icon: Tag, permission: 'categories:read' },
      { label: 'Inventario', href: '/dashboard/inventory', icon: Warehouse, permission: 'inventory:read' },
      { label: 'Activos', href: '/dashboard/assets', icon: Box, permission: 'assets:read' },
    ],
  },
  {
    title: 'Comercio',
    items: [
      { label: 'Ventas', href: '/dashboard/sales', icon: ShoppingCart, permission: 'sales:read' },
      { label: 'Compras', href: '/dashboard/purchases', icon: Truck, permission: 'purchases:read' },
      { label: 'Clientes', href: '/dashboard/clients', icon: Users, permission: 'clients:read' },
      { label: 'Proveedores', href: '/dashboard/suppliers', icon: Store, permission: 'suppliers:read' },
      { label: 'Caja', href: '/dashboard/cash-register', icon: CreditCard, permission: 'cash_register:read' },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { label: 'Transacciones', href: '/dashboard/finance', icon: DollarSign, permission: 'finance:read' },
      { label: 'Documentos', href: '/dashboard/documents', icon: FileText, permission: 'documents:read' },
      { label: 'Reportes', href: '/dashboard/reports', icon: ClipboardList, permission: 'reports:read' },
    ],
  },
  {
    title: 'Empresa',
    items: [
      { label: 'Sucursales', href: '/dashboard/branches', icon: Building2, permission: 'branches:read' },
      { label: 'Usuarios', href: '/dashboard/users', icon: Users, permission: 'users:read' },
      { label: 'Configuración', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, sidebarCollapsed, setSidebarOpen, setSidebarCollapsed } = useUiStore();
  const { user, logout, hasPermission } = useAuthStore();

  function canSee(item: NavItem): boolean {
    if (!item.permission) return true;
    // While profile loads, show nothing except unpermissioned items
    if (!user) return false;
    return hasPermission(item.permission);
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full flex-col border-r bg-card transition-all duration-300 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          sidebarCollapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* Header */}
        <div className={cn('flex h-14 items-center border-b px-3', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
          {!sidebarCollapsed && (
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-primary">
              <Package className="h-5 w-5" />
              <span>Inventario</span>
            </Link>
          )}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex h-8 w-8"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <ChevronLeft className={cn('h-4 w-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Nav */}
        <ScrollArea className="flex-1 py-2">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(canSee);
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title} className="mb-2">
                {!sidebarCollapsed && (
                  <p className="px-4 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {group.title}
                  </p>
                )}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        'flex items-center gap-3 mx-2 px-3 py-2 rounded-md text-sm transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        sidebarCollapsed && 'justify-center px-2',
                      )}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </ScrollArea>

        {/* User */}
        <div className="border-t p-3">
          <div className={cn('flex items-center gap-3', sidebarCollapsed && 'flex-col')}>
            <Link href="/dashboard/profile" onClick={() => setSidebarOpen(false)} title="Mi perfil">
              <Avatar className="h-8 w-8 shrink-0 cursor-pointer hover:opacity-80 transition-opacity">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {user ? getInitials(user.firstName, user.lastName) : '?'}
                </AvatarFallback>
              </Avatar>
            </Link>
            {!sidebarCollapsed && user && (
              <Link href="/dashboard/profile" className="flex-1 min-w-0 hover:opacity-80 transition-opacity" onClick={() => setSidebarOpen(false)}>
                <p className="text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-muted-foreground truncate capitalize">{user.role?.replace(/_/g, ' ')}</p>
              </Link>
            )}
            {!sidebarCollapsed && !user && (
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Cargando...</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
