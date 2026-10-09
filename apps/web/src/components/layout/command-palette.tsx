'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Moon, Package, Search, Sun, UserRound } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { NAV_GROUPS } from '@/config/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';

type ProductHit = { id: string; name: string; internalCode: string | null; salePrice: number | string };

/** Paleta de comandos global (Ctrl/⌘ + K): navegación, búsqueda de productos y acciones rápidas. */
export function CommandPalette() {
  const router = useRouter();
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const { theme, setTheme } = useUiStore();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useUiStore.getState().commandOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const canSearchProducts = user?.permissions.includes('products:read') ?? false;
  const { data: products = [] } = useQuery<ProductHit[]>({
    queryKey: ['command-products', search],
    enabled: open && canSearchProducts && search.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await apiClient.get('/products', { params: { search: search.trim(), limit: 6 } });
      return data.data?.data ?? [];
    },
  });

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const permissions = user?.permissions ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Buscar y navegar</DialogTitle>
        <Command
          label="Paleta de comandos"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
          shouldFilter
        >
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Buscar módulos, productos o acciones..."
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">ESC</kbd>
          </div>
          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            <Command.Empty className="py-10 text-center text-sm text-muted-foreground">Sin resultados.</Command.Empty>

            {products.length > 0 && (
              <Command.Group heading="Productos">
                {products.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`producto ${p.name} ${p.internalCode ?? ''} ${search}`}
                    onSelect={() => go(`/dashboard/products?search=${encodeURIComponent(p.name)}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="tabular text-xs text-muted-foreground">{formatCurrency(Number(p.salePrice))}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {NAV_GROUPS.map((group) => {
              const items = group.items.filter((i) => !i.permission || permissions.includes(i.permission));
              if (items.length === 0) return null;
              return (
                <Command.Group key={group.title} heading={group.title}>
                  {items.map((item) => (
                    <Command.Item
                      key={item.href}
                      value={`${item.label} ${(item.keywords ?? []).join(' ')}`}
                      onSelect={() => go(item.href)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                    >
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}

            <Command.Group heading="Cuenta">
              <Command.Item
                value="mi perfil cuenta"
                onSelect={() => go('/dashboard/profile')}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent"
              >
                <UserRound className="h-4 w-4 text-muted-foreground" /> Mi perfil
              </Command.Item>
              <Command.Item
                value="cambiar tema oscuro claro"
                onSelect={() => {
                  setTheme(theme === 'dark' ? 'light' : 'dark');
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
                Cambiar a tema {theme === 'dark' ? 'claro' : 'oscuro'}
              </Command.Item>
              <Command.Item
                value="cerrar sesion salir"
                onSelect={async () => {
                  setOpen(false);
                  await logout();
                  router.replace('/login');
                }}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-destructive aria-selected:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
