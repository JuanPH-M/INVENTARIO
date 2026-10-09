'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Building2, CheckCheck, ChevronDown, LogOut, Menu, Monitor, Moon, Search, Sun, UserRound } from 'lucide-react';
import { useUiStore, type Theme } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { apiClient } from '@/lib/api-client';
import { useBranches } from '@/hooks/use-branches';
import { findNavItem } from '@/config/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, formatRelativeTime, getInitials } from '@/lib/utils';

type Notification = {
  id: string;
  title: string;
  body?: string | null;
  status: 'read' | 'unread';
  priority?: string;
  sentAt: string;
};

const THEMES: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

function BranchSelector() {
  const { data: branches = [] } = useBranches();
  const branchId = useUiStore((s) => s.branchId);
  const setBranchId = useUiStore((s) => s.setBranchId);

  // Si la sede guardada ya no existe, vuelve a "todas"
  useEffect(() => {
    if (branchId && branches.length > 0 && !branches.some((b) => b.id === branchId)) setBranchId('');
  }, [branchId, branches, setBranchId]);

  if (branches.length < 2) return null;
  const current = branches.find((b) => b.id === branchId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="hidden max-w-[220px] gap-2 md:inline-flex">
          <Building2 className="text-muted-foreground" />
          <span className="truncate">{current?.name ?? 'Todas las sedes'}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Filtrar por sede</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setBranchId('')} className={cn(!branchId && 'font-semibold text-primary')}>
          Todas las sedes
        </DropdownMenuItem>
        {branches.map((b) => (
          <DropdownMenuItem key={b.id} onClick={() => setBranchId(b.id)} className={cn(b.id === branchId && 'font-semibold text-primary')}>
            <span className="truncate">{b.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsMenu() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => (await apiClient.get('/notifications/unread-count')).data.data as { count: number },
    refetchInterval: 60_000,
  });

  const { data: items = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications', 'list'],
    enabled: open,
    queryFn: async () => {
      const { data } = await apiClient.get('/notifications', { params: { limit: 15 } });
      return data.data?.data ?? [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markAll = useMutation({ mutationFn: () => apiClient.patch('/notifications/read-all'), onSuccess: refresh });
  const markOne = useMutation({ mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`), onSuccess: refresh });

  const count = unread?.count ?? 0;

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen((v) => !v)} aria-label="Notificaciones">
        <Bell />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover shadow-elevated">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Notificaciones</p>
            {count > 0 && (
              <button
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como leídas
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Cargando...</p>
            ) : items.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">No tienes notificaciones</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={cn(
                    'flex w-full gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50',
                    n.status === 'unread' && 'bg-primary/[0.04]',
                  )}
                  onClick={() => n.status === 'unread' && markOne.mutate(n.id)}
                >
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      n.status === 'unread' ? (n.priority === 'high' ? 'bg-destructive' : 'bg-primary') : 'bg-transparent',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">{n.title}</span>
                    {n.body && <span className="mt-0.5 block whitespace-pre-line text-xs text-muted-foreground line-clamp-3">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-muted-foreground">{formatRelativeTime(n.sentAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { theme, setTheme } = useUiStore();
  if (!user) return null;

  const roleLabel = user.userRoles?.[0]?.roleName ?? user.role.replace(/_/g, ' ');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-muted" aria-label="Menú de usuario">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {getInitials(user.firstName, user.lastName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left lg:block">
            <span className="block max-w-[140px] truncate text-sm font-medium leading-tight">
              {user.firstName} {user.lastName}
            </span>
            <span className="block max-w-[140px] truncate text-[11px] capitalize text-muted-foreground">{roleLabel}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-muted-foreground lg:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile" className="cursor-pointer">
            <UserRound className="mr-2 h-4 w-4" /> Mi perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Tema</DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1 px-2 pb-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border py-1.5 text-[11px] transition-colors',
                theme === t.value ? 'border-primary bg-primary/10 text-primary' : 'border-transparent hover:bg-muted',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const pathname = usePathname();
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);
  const current = findNavItem(pathname);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
        <Menu />
      </Button>

      <div className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
        <span className="text-muted-foreground">Inicio</span>
        {current && current.href !== '/dashboard' && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <span className="truncate font-medium">{current.label}</span>
          </>
        )}
      </div>

      <button
        onClick={() => setCommandOpen(true)}
        className="ml-auto flex h-9 w-full max-w-[280px] items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:border-primary/40 sm:ml-6 md:w-72"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 truncate text-left">Buscar...</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-sans text-[10px] font-medium sm:inline-block">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <BranchSelector />
        <NotificationsMenu />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
