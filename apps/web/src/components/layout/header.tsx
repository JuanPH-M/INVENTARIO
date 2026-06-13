'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bell, Menu, Moon, Search, Sun } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/stores/ui.store';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const SEARCH_ROUTES: { path: string; label: string }[] = [
  { path: '/dashboard/products', label: 'Productos' },
  { path: '/dashboard/users', label: 'Usuarios' },
  { path: '/dashboard/clients', label: 'Clientes' },
  { path: '/dashboard/suppliers', label: 'Proveedores' },
  { path: '/dashboard/sales', label: 'Ventas' },
  { path: '/dashboard/purchases', label: 'Compras' },
  { path: '/dashboard/inventory', label: 'Inventario' },
  { path: '/dashboard/branches', label: 'Sucursales' },
  { path: '/dashboard/categories', label: 'Categorías' },
  { path: '/dashboard/finance', label: 'Transacciones' },
  { path: '/dashboard/reports', label: 'Reportes' },
  { path: '/dashboard/incidents', label: 'Incidencias' },
  { path: '/dashboard/ai', label: 'Inteligencia Artificial' },
];

type Notification = {
  id: string;
  title: string;
  body?: string;
  status: 'read' | 'unread';
  sentAt: string;
};

export function Header({ title }: { title?: string }) {
  const { setSidebarOpen, theme, setTheme } = useUiStore();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  // Search state
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Notifications state
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const current = SEARCH_ROUTES.find((r) => pathname.startsWith(r.path));
    if (current) {
      router.push(`${current.path}?search=${encodeURIComponent(query.trim())}`);
    } else {
      router.push(`/dashboard/products?search=${encodeURIComponent(query.trim())}`);
    }
    setShowSuggestions(false);
  }

  const suggestions = query.length >= 2
    ? SEARCH_ROUTES.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!inputRef.current?.parentElement?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close notification panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!notifRef.current?.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notifOpen]);

  // Unread count — poll every 60s
  const { data: unreadData } = useQuery({
    queryKey: ['notif-unread'],
    queryFn: async () => {
      const { data } = await apiClient.get('/notifications/unread-count');
      return data.data as { count: number };
    },
    refetchInterval: 60_000,
  });

  // Notification list — only fetched when panel is open
  const { data: notifications, isLoading: notifLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await apiClient.get('/notifications', { params: { limit: 15 } });
      return data.data?.items ?? [];
    },
    enabled: notifOpen,
  });

  const markAllRead = useMutation({
    mutationFn: () => apiClient.patch('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notif-unread'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markOneRead = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notif-unread'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = unreadData?.count ?? 0;

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden h-8 w-8"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {title && <h1 className="hidden sm:block text-lg font-semibold">{title}</h1>}

      <form onSubmit={handleSearch} className="flex-1 hidden md:block max-w-sm">
        <div className="relative" ref={inputRef as React.RefObject<HTMLDivElement>}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Buscar en esta sección..."
            className="pl-9 h-8 bg-muted border-0"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-md z-50 py-1">
              {suggestions.map((s) => (
                <button
                  key={s.path}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => { router.push(s.path); setQuery(''); setShowSuggestions(false); }}
                >
                  Ir a <span className="font-medium">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </form>

      <div className="ml-auto flex items-center gap-1">
        {/* Notifications panel */}
        <div className="relative" ref={notifRef}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 relative"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notificaciones"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>

          {notifOpen && (
            <div className="absolute right-0 top-10 w-80 bg-popover border rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <span className="text-sm font-semibold">
                  Notificaciones
                  {unreadCount > 0 && (
                    <span className="ml-2 text-xs bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 font-bold">
                      {unreadCount}
                    </span>
                  )}
                </span>
                {unreadCount > 0 && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                  >
                    Marcar todas leídas
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
                ) : !notifications || notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Sin notificaciones</p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 hover:bg-accent/50 transition-colors ${n.status === 'unread' ? 'bg-primary/5' : ''}`}
                      onClick={() => { if (n.status === 'unread') markOneRead.mutate(n.id); }}
                    >
                      <div className="flex items-start gap-2">
                        {n.status === 'unread' && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                        <div className={n.status === 'unread' ? '' : 'ml-4'}>
                          <p className="text-sm font-medium leading-tight">{n.title}</p>
                          {n.body && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(n.sentAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
