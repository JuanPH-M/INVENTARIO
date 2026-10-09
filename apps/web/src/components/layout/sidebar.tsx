'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { NAV_GROUPS, findNavItem, type NavItem } from '@/config/navigation';
import { Logo } from '@/components/brand/logo';
import { BRAND } from '@/config/brand';

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, sidebarCollapsed, setSidebarOpen, setSidebarCollapsed } = useUiStore();
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];
  const activeHref = findNavItem(pathname)?.href;

  const canSee = (item: NavItem) => !item.permission || permissions.includes(item.permission);

  return (
    <>
      {/* Fondo oscuro en móvil */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity lg:hidden',
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-300 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          sidebarCollapsed ? 'w-[72px]' : 'w-[260px]',
        )}
        aria-label="Navegación principal"
      >
        <div className={cn('flex h-16 shrink-0 items-center px-4', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
          <Link href="/dashboard" onClick={() => setSidebarOpen(false)} aria-label={BRAND.name}>
            <Logo collapsed={sidebarCollapsed} inverted />
          </Link>
          <button
            className="rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-accent hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {user?.tenant && !sidebarCollapsed && (
          <div className="mx-3 mb-2 rounded-lg border border-sidebar-border bg-sidebar-accent/60 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">Empresa</p>
            <p className="truncate text-sm font-medium text-white">{user.tenant.name}</p>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 pt-1 [scrollbar-width:thin]">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(canSee);
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="mt-4 first:mt-1">
                {!sidebarCollapsed ? (
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                    {group.title}
                  </p>
                ) : (
                  <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = item.href === activeHref;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          title={sidebarCollapsed ? item.label : undefined}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
                            active
                              ? 'bg-sidebar-active/15 text-white'
                              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white',
                            sidebarCollapsed && 'justify-center px-0',
                          )}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-active" />
                          )}
                          <Icon
                            className={cn(
                              'h-[18px] w-[18px] shrink-0 transition-colors',
                              active ? 'text-sidebar-active' : 'text-sidebar-muted group-hover:text-white',
                            )}
                          />
                          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="hidden shrink-0 border-t border-sidebar-border p-3 lg:block">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-white',
              sidebarCollapsed && 'justify-center px-0',
            )}
            aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            <ChevronsLeft className={cn('h-4 w-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
            {!sidebarCollapsed && <span>Contraer menú</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
