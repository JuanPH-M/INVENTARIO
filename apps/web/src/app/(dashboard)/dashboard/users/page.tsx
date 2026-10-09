'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, KeyRound, Loader2, MoreHorizontal, Plus, Search, ShieldPlus, Trash2, Users, X } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { formatRelativeTime, getInitials } from '@/lib/utils';
import { useBranches } from '@/hooks/use-branches';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { confirm } from '@/components/common/confirm-dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Paginator } from '@/components/ui/paginator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  userRoles: Array<{ role: { name: string; slug: string }; branch: { name: string } | null }>;
};

type UserDetail = Omit<UserRow, 'userRoles'> & {
  userRoles: Array<{ roleId: string; role: { id: string; name: string; slug: string }; branch: { id: string; name: string } | null }>;
};

type Role = { id: string; name: string; slug: string; description?: string | null; _count?: { userRoles: number } };

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  active: { label: 'Activo', tone: 'success' },
  locked: { label: 'Bloqueado', tone: 'warning' },
  suspended: { label: 'Suspendido', tone: 'destructive' },
  pending: { label: 'Pendiente', tone: 'secondary' },
  inactive: { label: 'Inactivo', tone: 'secondary' },
};

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export default function UsersPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const can = (p: string) => me?.permissions.includes(p) ?? false;
  const { data: branches = [] } = useBranches();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [rolesFor, setRolesFor] = useState<string | null>(null);
  const debounced = useDebounce(search);

  const params = { page, limit: 20, search: debounced || undefined };
  const { data, isLoading, isError, error, refetch } = useQuery<Paginated<UserRow>>({
    queryKey: ['users', params],
    queryFn: async () => (await apiClient.get('/users', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles'],
    enabled: can('roles:read'),
    queryFn: async () => (await apiClient.get('/roles')).data.data,
  });
  // Solo un super administrador puede ver/otorgar el rol de plataforma
  const assignableRoles = roles.filter((r) => r.slug !== 'super_admin' || me?.roles.includes('super_admin'));

  const refresh = () => void qc.invalidateQueries({ queryKey: ['users'] });

  const statusAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'suspend' | 'activate' | 'delete' }) =>
      action === 'delete' ? apiClient.delete(`/users/${id}`) : apiClient.patch(`/users/${id}/${action}`),
    onSuccess: (_r, v) => {
      toast({ title: { suspend: 'Usuario suspendido', activate: 'Usuario activado', delete: 'Usuario eliminado' }[v.action] });
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo completar', description: getErrorMessage(err) }),
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Personal de la empresa, roles por sede y control de acceso"
        icon={Users}
        actions={
          can('users:create') && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nuevo usuario
            </Button>
          )
        }
      />

      <Card>
        <div className="border-b p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por nombre o correo" className="pl-9" />
          </div>
        </div>
        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="hidden md:table-cell">Último acceso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : rows.map((u) => {
                      const st = STATUS[u.status] ?? { label: u.status, tone: 'secondary' as const };
                      const isMe = u.id === me?.id;
                      return (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{getInitials(u.firstName, u.lastName)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="font-medium">
                                  {u.firstName} {u.lastName} {isMe && <span className="text-xs text-muted-foreground">(tú)</span>}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {u.userRoles.length === 0 && <span className="text-xs text-muted-foreground">Sin rol</span>}
                              {u.userRoles.map((ur, i) => (
                                <Badge key={i} variant="secondary">
                                  {ur.role.name}
                                  {ur.branch && <span className="text-muted-foreground"> · {ur.branch.name}</span>}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                            {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : 'Nunca'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge variant={st.tone}>{st.label}</Badge>
                              {u.mfaEnabled && <KeyRound className="h-3.5 w-3.5 text-success" aria-label="Doble factor activo" />}
                            </div>
                          </TableCell>
                          <TableCell>
                            {!isMe && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" aria-label="Acciones">
                                    <MoreHorizontal />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  {can('users:assign_roles') && (
                                    <DropdownMenuItem onClick={() => setRolesFor(u.id)}>
                                      <ShieldPlus className="mr-2 h-4 w-4" /> Roles y sedes
                                    </DropdownMenuItem>
                                  )}
                                  {(u.status === 'active' ? can('users:suspend') : can('users:update')) &&
                                    (u.status === 'active' ? (
                                      <DropdownMenuItem onClick={() => statusAction.mutate({ id: u.id, action: 'suspend' })}>
                                        <Ban className="mr-2 h-4 w-4" /> Suspender acceso
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem onClick={() => statusAction.mutate({ id: u.id, action: 'activate' })}>
                                        <CheckCircle2 className="mr-2 h-4 w-4" /> Activar / desbloquear
                                      </DropdownMenuItem>
                                    ))}
                                  {can('users:delete') && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={async () => {
                                          if (
                                            await confirm({
                                              title: `¿Eliminar a ${u.firstName} ${u.lastName}?`,
                                              description: 'Perderá el acceso de inmediato. Su historial de ventas se conserva.',
                                              destructive: true,
                                              confirmText: 'Eliminar',
                                            })
                                          )
                                            statusAction.mutate({ id: u.id, action: 'delete' });
                                        }}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
            {!isLoading && rows.length === 0 && <EmptyState icon={Users} title="No se encontraron usuarios" />}
            {(data?.meta.totalPages ?? 0) > 1 && (
              <div className="border-t p-4">
                <Paginator page={page} totalPages={data!.meta.totalPages} total={data!.meta.total} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} roles={assignableRoles} branches={branches} onCreated={refresh} />
      <RolesDialog userId={rolesFor} onClose={() => setRolesFor(null)} roles={assignableRoles} branches={branches} onChanged={refresh} />
    </div>
  );
}

function CreateUserDialog({
  open,
  onClose,
  roles,
  branches,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  roles: Role[];
  branches: Array<{ id: string; name: string }>;
  onCreated: () => void;
}) {
  const empty = { firstName: '', lastName: '', email: '', phone: '', password: '', roleId: '', branchId: '' };
  const [form, setForm] = useState(empty);
  const create = useMutation({
    mutationFn: async () =>
      apiClient.post('/users', {
        ...form,
        phone: form.phone || undefined,
        branchId: form.branchId || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Usuario creado', description: 'Ya puede iniciar sesión con su correo y la contraseña asignada.' });
      setForm(empty);
      onClose();
      onCreated();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo crear el usuario', description: getErrorMessage(err) }),
  });

  const valid =
    form.firstName.trim().length >= 2 &&
    form.lastName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    PASSWORD_RULE.test(form.password) &&
    !!form.roleId;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Asigna un rol para toda la empresa o limítalo a una sede específica.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="u-first">Nombre</Label>
            <Input id="u-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-last">Apellido</Label>
            <Input id="u-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-email">Correo</Label>
            <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-phone">Teléfono (opcional)</Label>
            <Input id="u-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="u-pass">Contraseña inicial</Label>
            <Input id="u-pass" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p className={form.password && !PASSWORD_RULE.test(form.password) ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              Mínimo 8 caracteres con mayúscula, minúscula y número.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Rol</Label>
            <Select value={form.roleId} onValueChange={(v) => setForm({ ...form, roleId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Alcance</Label>
            <Select value={form.branchId || 'all'} onValueChange={(v) => setForm({ ...form, branchId: v === 'all' ? '' : v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sedes</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    Solo {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="animate-spin" />}
            Crear usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolesDialog({
  userId,
  onClose,
  roles,
  branches,
  onChanged,
}: {
  userId: string | null;
  onClose: () => void;
  roles: Role[];
  branches: Array<{ id: string; name: string }>;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [roleId, setRoleId] = useState('');
  const [branchId, setBranchId] = useState('');
  const { data: user } = useQuery<UserDetail>({
    queryKey: ['users', 'detail', userId],
    enabled: !!userId,
    queryFn: async () => (await apiClient.get(`/users/${userId}`)).data.data,
  });

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['users', 'detail', userId] });
    onChanged();
  };

  const add = useMutation({
    mutationFn: async () => apiClient.post(`/users/${userId}/roles`, { roleId, branchId: branchId || undefined }),
    onSuccess: () => {
      toast({ title: 'Rol asignado' });
      setRoleId('');
      setBranchId('');
      done();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo asignar', description: getErrorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: async (v: { roleId: string; branchId?: string }) => apiClient.delete(`/users/${userId}/roles`, { data: v }),
    onSuccess: () => {
      toast({ title: 'Rol retirado' });
      done();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo retirar', description: getErrorMessage(err) }),
  });

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Roles de {user ? `${user.firstName} ${user.lastName}` : '...'}</DialogTitle>
          <DialogDescription>Un mismo usuario puede tener roles distintos en cada sede (p. ej. Gerente en una tienda y Vendedor en otra).</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {user?.userRoles.length === 0 && <p className="text-sm text-muted-foreground">Sin roles asignados.</p>}
          {user?.userRoles.map((ur) => (
            <div key={`${ur.roleId}-${ur.branch?.id ?? 'all'}`} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium">{ur.role.name}</p>
                <p className="text-xs text-muted-foreground">{ur.branch ? ur.branch.name : 'Todas las sedes'}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove.mutate({ roleId: ur.roleId, branchId: ur.branch?.id })} aria-label="Quitar rol">
                <X />
              </Button>
            </div>
          ))}
        </div>
        <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger>
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={branchId || 'all'} onValueChange={(v) => setBranchId(v === 'all' ? '' : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sedes</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!roleId || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Asignar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
