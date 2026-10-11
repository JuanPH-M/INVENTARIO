'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Globe, Loader2, Mail, MapPin, Pencil, Phone, Plus, Store, Trash2, UserPlus, Users, Warehouse, X } from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { useCan } from '@/hooks/use-can';
import { toast } from '@/hooks/use-toast';
import { confirm } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Branch = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  address: { street?: string; city?: string } | null;
  phone: string | null;
  email: string | null;
  managerId: string | null;
  isActive: boolean;
  manager?: { firstName: string; lastName: string } | null;
  _count?: { inventoryStock: number; sales: number; cashRegisters: number };
};
type BranchUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userRoles: { roleId: string; branchId: string | null; role: { id: string; name: string } }[];
};
type Overview = { byBranch: { branchId: string; revenue: number; transactions: number }[] };

const TYPES: Record<string, { label: string; icon: React.ElementType }> = {
  physical: { label: 'Tienda física', icon: Store },
  warehouse: { label: 'Bodega / CEDI', icon: Warehouse },
  online: { label: 'Tienda en línea', icon: Globe },
  popup: { label: 'Punto temporal', icon: Building2 },
};

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  code: z.string().trim().max(50).optional(),
  type: z.string(),
  street: z.string().trim().optional(),
  city: z.string().trim().optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email('Correo inválido').optional().or(z.literal('')),
  managerId: z.string().optional(),
});
type BranchForm = z.infer<typeof schema>;

function useUserOptions(enabled: boolean) {
  return useQuery<BranchUser[]>({
    queryKey: ['users', 'options', 'full'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => (await apiClient.get('/users', { params: { limit: 100 } })).data.data.data ?? [],
  });
}

function BranchStaffDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const { data: allUsers = [] } = useUserOptions(!!branch);

  const { data: staff = [], isLoading } = useQuery<BranchUser[]>({
    queryKey: ['users', 'branch', branch?.id],
    enabled: !!branch,
    queryFn: async () => (await apiClient.get('/users', { params: { branchId: branch!.id, limit: 100 } })).data.data.data ?? [],
  });

  const { data: roles = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['roles'],
    enabled: !!branch,
    queryFn: async () => (await apiClient.get('/roles')).data.data ?? [],
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['users'] });

  const assign = useMutation({
    mutationFn: () => apiClient.post(`/users/${userId}/roles`, { roleId, branchId: branch!.id }),
    onSuccess: () => {
      toast({ title: 'Usuario asignado a la sede' });
      setUserId('');
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo asignar', description: getErrorMessage(err) }),
  });

  const unassign = useMutation({
    mutationFn: (v: { userId: string; roleId: string }) => apiClient.delete(`/users/${v.userId}/roles`, { data: { roleId: v.roleId, branchId: branch!.id } }),
    onSuccess: () => {
      toast({ title: 'Usuario retirado de la sede' });
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo retirar', description: getErrorMessage(err) }),
  });

  const staffIds = new Set(staff.map((u) => u.id));
  const available = allUsers.filter((u) => !staffIds.has(u.id));

  return (
    <Dialog open={!!branch} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Personal de {branch?.name}
          </DialogTitle>
          <DialogDescription>El rol asignado define qué puede hacer cada persona dentro de esta sede.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl bg-muted/40 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4" /> Agregar persona
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Usuario" />
              </SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No hay más usuarios. Créalos en Usuarios.</p>
                ) : (
                  available.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
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
            <Button disabled={!userId || !roleId || assign.isPending} onClick={() => assign.mutate()}>
              {assign.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Asignados ({staff.length})</p>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : staff.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nadie asignado a esta sede todavía.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {staff.map((u) => {
                const here = u.userRoles.filter((r) => r.branchId === branch?.id);
                return (
                  <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    {here.map((r) => (
                      <Badge key={r.roleId} variant="secondary" className="gap-1 pr-1">
                        {r.role.name}
                        <button
                          aria-label={`Quitar rol ${r.role.name}`}
                          className="rounded p-0.5 hover:bg-destructive/15 hover:text-destructive"
                          disabled={unassign.isPending}
                          onClick={() => unassign.mutate({ userId: u.id, roleId: r.roleId })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BranchesPage() {
  const qc = useQueryClient();
  const canCreate = useCan('branches:create');
  const canUpdate = useCan('branches:update');
  const canDelete = useCan('branches:delete');
  const canAnalytics = useCan('analytics:read');
  const canStaff = useCan('users:assign_roles');
  const canUsers = useCan('users:read');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [staffOf, setStaffOf] = useState<Branch | null>(null);
  const { data: users = [] } = useUserOptions(open && canUsers);

  const { data: branches = [], isLoading, isError, error, refetch } = useQuery<Branch[]>({
    queryKey: ['branches', 'full'],
    queryFn: async () => (await apiClient.get('/branches')).data.data ?? [],
  });

  const { data: overview } = useQuery<Overview>({
    queryKey: ['analytics', 'overview', 'all', 30],
    enabled: canAnalytics,
    queryFn: async () => (await apiClient.get('/analytics/overview', { params: { days: 30 } })).data.data,
  });
  const salesOf = new Map((overview?.byBranch ?? []).map((b) => [b.branchId, b]));
  const totalRevenue = (overview?.byBranch ?? []).reduce((s, b) => s + b.revenue, 0);

  const form = useForm<BranchForm>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;

  const refresh = () => void qc.invalidateQueries({ queryKey: ['branches'] });

  const save = useMutation({
    mutationFn: (v: BranchForm) => {
      const body = {
        name: v.name,
        code: v.code || undefined,
        type: v.type,
        phone: v.phone || undefined,
        email: v.email || undefined,
        managerId: v.managerId || undefined,
        address: v.street || v.city ? { street: v.street ?? '', city: v.city ?? '' } : undefined,
      };
      return editing ? apiClient.patch(`/branches/${editing.id}`, body) : apiClient.post('/branches', body);
    },
    onSuccess: () => {
      toast({ title: editing ? 'Sede actualizada' : 'Sede creada' });
      setOpen(false);
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) }),
  });

  const toggle = useMutation({
    mutationFn: (b: Branch) => apiClient.patch(`/branches/${b.id}`, { isActive: !b.isActive }),
    onSuccess: () => refresh(),
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo cambiar el estado', description: getErrorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/branches/${id}`),
    onSuccess: () => {
      toast({ title: 'Sede eliminada' });
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo eliminar', description: getErrorMessage(err) }),
  });

  const openForm = (b: Branch | null) => {
    setEditing(b);
    form.reset({
      name: b?.name ?? '',
      code: b?.code ?? '',
      type: b?.type ?? 'physical',
      street: b?.address?.street ?? '',
      city: b?.address?.city ?? '',
      phone: b?.phone ?? '',
      email: b?.email ?? '',
      managerId: b?.managerId ?? '',
    });
    setOpen(true);
  };

  const active = branches.filter((b) => b.isActive).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sedes"
        description={
          branches.length
            ? `${branches.length} sedes · ${active} activas. Inventario, cajas y personal independientes con información consolidada.`
            : 'Tiendas, bodegas y puntos de venta de la empresa'
        }
        icon={Building2}
        actions={
          canCreate && (
            <Button onClick={() => openForm(null)}>
              <Plus /> Nueva sede
            </Button>
          )
        }
      />

      {isError ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} />
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Aún no hay sedes"
            description="Crea tu primera tienda o bodega para empezar a vender e inventariar."
            action={
              canCreate ? (
                <Button onClick={() => openForm(null)}>
                  <Plus /> Nueva sede
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {branches.map((b) => {
            const t = TYPES[b.type] ?? TYPES['physical']!;
            const Icon = t.icon;
            const s = salesOf.get(b.id);
            const share = totalRevenue > 0 && s ? (s.revenue / totalRevenue) * 100 : 0;
            return (
              <Card key={b.id} className={cn('flex flex-col p-5 transition-shadow hover:shadow-md', !b.isActive && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{b.name}</p>
                      {b.code && <span className="font-mono text-xs text-muted-foreground">{b.code}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{t.label}</p>
                  </div>
                  <Badge variant={b.isActive ? 'success' : 'secondary'}>{b.isActive ? 'Activa' : 'Inactiva'}</Badge>
                </div>

                <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                  {(b.address?.street || b.address?.city) && (
                    <p className="flex items-center gap-2 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> {[b.address?.street, b.address?.city].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {b.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" /> {b.phone}
                    </p>
                  )}
                  {b.email && (
                    <p className="flex items-center gap-2 truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0" /> {b.email}
                    </p>
                  )}
                  <p className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 shrink-0" /> Encargado: {b.manager ? `${b.manager.firstName} ${b.manager.lastName}` : 'sin asignar'}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-center">
                  <div>
                    <p className="text-sm font-semibold tabular-nums">{formatNumber(b._count?.inventoryStock ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground">Productos</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold tabular-nums">{formatNumber(b._count?.cashRegisters ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground">Cajas</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold tabular-nums">{formatNumber(b._count?.sales ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground">Ventas</p>
                  </div>
                </div>

                {canAnalytics && (
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">Ventas últimos 30 días</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(s?.revenue ?? 0)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${share}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{share.toFixed(0)} % del total de la cadena</p>
                  </div>
                )}

                <div className="mt-auto flex flex-wrap gap-1 pt-4">
                  {canStaff && (
                    <Button variant="outline" size="sm" onClick={() => setStaffOf(b)}>
                      <Users /> Personal
                    </Button>
                  )}
                  {canUpdate && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openForm(b)}>
                        <Pencil /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate(b)}>
                        {b.isActive ? 'Desactivar' : 'Activar'}
                      </Button>
                    </>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-8 w-8 text-destructive hover:text-destructive"
                      aria-label="Eliminar sede"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `¿Eliminar "${b.name}"?`,
                          description: 'Solo se pueden eliminar sedes sin ventas ni inventario. Si ya operó, desactívala.',
                          destructive: true,
                          confirmText: 'Eliminar',
                        });
                        if (ok) remove.mutate(b.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <BranchStaffDialog branch={staffOf} onClose={() => setStaffOf(null)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar sede' : 'Nueva sede'}</DialogTitle>
            <DialogDescription>Cada sede tiene su propio inventario, cajas y personal.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <div className="space-y-1.5">
                <Label htmlFor="b-name">Nombre *</Label>
                <Input id="b-name" autoFocus {...form.register('name')} placeholder="Ej. Sede Centro" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-code">Código</Label>
                <Input id="b-code" {...form.register('code')} placeholder="CEN" className="uppercase" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.watch('type')} onValueChange={(v) => form.setValue('type', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPES).map(([v, t]) => (
                    <SelectItem key={v} value={v}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="b-street">Dirección</Label>
                <Input id="b-street" {...form.register('street')} placeholder="Cra 7 # 12-34" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-city">Ciudad</Label>
                <Input id="b-city" {...form.register('city')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-phone">Teléfono</Label>
                <Input id="b-phone" {...form.register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-email">Correo</Label>
                <Input id="b-email" type="email" {...form.register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
            </div>
            {canUsers && (
              <div className="space-y-1.5">
                <Label>Encargado de la sede</Label>
                <Select value={form.watch('managerId') || '__none__'} onValueChange={(v) => form.setValue('managerId', v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin encargado</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />}
                {editing ? 'Guardar cambios' : 'Crear sede'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
