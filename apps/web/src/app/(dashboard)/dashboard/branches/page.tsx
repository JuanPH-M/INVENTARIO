'use client';

import { confirm } from '@/components/common/confirm-dialog';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Trash2, Users, UserPlus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

type Branch = { id: string; name: string; phone?: string; isMain: boolean; isActive: boolean };
type BranchUser = { id: string; firstName: string; lastName: string; email: string; userRoles: { role: { id: string; name: string }; branch?: { id: string } | null }[] };
type RoleOption = { id: string; name: string };
type UserOption = { id: string; firstName: string; lastName: string; email: string };

const schema = z.object({ name: z.string().min(2), phone: z.string().optional() });
const assignSchema = z.object({ userId: z.string().uuid(), roleId: z.string().uuid() });

export default function BranchesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [usersDialogBranch, setUsersDialogBranch] = useState<Branch | null>(null);
  const [editing, setEditing] = useState<Branch | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const assignForm = useForm<z.infer<typeof assignSchema>>({ resolver: zodResolver(assignSchema) });

  const { data: branches, isLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/branches');
        return Array.isArray(data) ? data : (data.data?.items ?? data.data ?? []);
      } catch {
        return [];
      }
    },
  });

  const { data: branchUsers, isLoading: loadingBranchUsers } = useQuery<BranchUser[]>({
    queryKey: ['branch-users', usersDialogBranch?.id],
    enabled: !!usersDialogBranch,
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/users', { params: { branchId: usersDialogBranch!.id, limit: 100 } });
        const p = data.data;
        return Array.isArray(p.data) ? p.data : (Array.isArray(p) ? p : []);
      } catch {
        return [];
      }
    },
  });

  const { data: allUsers } = useQuery<UserOption[]>({
    queryKey: ['users-options'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/users', { params: { limit: 200 } });
        const p = data.data;
        return Array.isArray(p.data) ? p.data : [];
      } catch {
        return [];
      }
    },
  });

  const { data: roles } = useQuery<RoleOption[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/roles');
        return Array.isArray(data) ? data : (data.data?.items ?? data.data ?? []);
      } catch {
        return [];
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: z.infer<typeof schema>) => apiClient.post('/branches', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); setDialogOpen(false); toast({ title: 'Sucursal creada' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al crear sucursal' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: z.infer<typeof schema> }) => apiClient.patch(`/branches/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); setDialogOpen(false); toast({ title: 'Sucursal actualizada' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al actualizar' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/branches/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); toast({ title: 'Sucursal eliminada' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al eliminar' }),
  });

  const assignUserMutation = useMutation({
    mutationFn: ({ userId, roleId, branchId }: { userId: string; roleId: string; branchId: string }) =>
      apiClient.post(`/users/${userId}/roles`, { roleId, branchId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branch-users', usersDialogBranch?.id] });
      assignForm.reset({ userId: '', roleId: '' });
      toast({ title: 'Usuario asignado a la sucursal' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Error al asignar usuario' }),
  });

  const removeUserMutation = useMutation({
    mutationFn: ({ userId, roleId, branchId }: { userId: string; roleId: string; branchId: string }) =>
      apiClient.delete(`/users/${userId}/roles`, { data: { roleId, branchId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branch-users', usersDialogBranch?.id] });
      toast({ title: 'Usuario removido de la sucursal' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Error al remover usuario' }),
  });

  function openCreate() { setEditing(null); form.reset({ name: '', phone: '' }); setDialogOpen(true); }
  function openEdit(b: Branch) { setEditing(b); form.reset({ name: b.name, phone: b.phone ?? '' }); setDialogOpen(true); }
  function openUsersDialog(b: Branch) { setUsersDialogBranch(b); assignForm.reset({ userId: '', roleId: '' }); }

  const branchList = branches ?? [];

  // Filter out users already assigned to the branch for the add selector
  const assignedUserIds = new Set((branchUsers ?? []).map(u => u.id));
  const availableUsers = (allUsers ?? []).filter(u => !assignedUserIds.has(u.id));

  const userIdVal = assignForm.watch('userId');
  const roleIdVal = assignForm.watch('roleId');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold">Sucursales</h2><p className="text-muted-foreground text-sm">Gestiona las sucursales de tu empresa</p></div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nueva sucursal</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>)}
        </div>
      ) : branchList.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No hay sucursales registradas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branchList.map((b) => (
            <Card key={b.id} className={b.isMain ? 'border-primary' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {b.name}
                    </CardTitle>
                    {b.isMain && <Badge className="mt-1">Principal</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openUsersDialog(b)} title="Gestionar usuarios">
                      <Users className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    {!b.isMain && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => { if (await confirm({ title: `¿Eliminar "${b.name}"?`, description: 'Esta acción no se puede deshacer.', destructive: true, confirmText: 'Confirmar' })) deleteMutation.mutate(b.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {b.phone && <p className="text-sm text-muted-foreground">{b.phone}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Branch edit/create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Editar sucursal' : 'Nueva sucursal'}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editing ? updateMutation.mutate({ id: editing.id, body: d }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input {...form.register('name')} placeholder="Ej: Sucursal Norte" />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1"><Label>Teléfono</Label><Input {...form.register('phone')} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Users management dialog */}
      <Dialog open={!!usersDialogBranch} onOpenChange={(open) => { if (!open) setUsersDialogBranch(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Usuarios — {usersDialogBranch?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Assign new user */}
            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2"><UserPlus className="h-4 w-4" /> Agregar usuario a esta sucursal</p>
              <p className="text-xs text-muted-foreground">El rol de sucursal determina los permisos del usuario dentro de esta sucursal específica.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Usuario</Label>
                  <Select value={userIdVal ?? ''} onValueChange={(v) => assignForm.setValue('userId', v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No hay usuarios disponibles. Crea usuarios en la sección Usuarios.
                        </div>
                      ) : (
                        availableUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rol en sucursal</Label>
                  <Select value={roleIdVal ?? ''} onValueChange={(v) => assignForm.setValue('roleId', v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(roles ?? []).length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No hay roles disponibles
                        </div>
                      ) : (
                        (roles ?? []).map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                size="sm"
                disabled={!userIdVal || !roleIdVal || assignUserMutation.isPending}
                onClick={() => {
                  if (userIdVal && roleIdVal && usersDialogBranch) {
                    assignUserMutation.mutate({ userId: userIdVal, roleId: roleIdVal, branchId: usersDialogBranch.id });
                  }
                }}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                {assignUserMutation.isPending ? 'Asignando…' : 'Asignar'}
              </Button>
            </div>

            {/* Current users list */}
            <div>
              <p className="text-sm font-medium mb-2">Usuarios asignados</p>
              {loadingBranchUsers ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (branchUsers ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Ningún usuario asignado a esta sucursal</p>
              ) : (
                <div className="space-y-2">
                  {(branchUsers ?? []).map((u) => {
                    const branchRole = u.userRoles?.find(ur => ur.branch?.id === usersDialogBranch?.id);
                    return (
                      <div key={u.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{u.firstName} {u.lastName}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {branchRole && <Badge variant="outline" className="text-xs">{branchRole.role.name}</Badge>}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={removeUserMutation.isPending}
                            onClick={() => {
                              if (branchRole && usersDialogBranch) {
                                removeUserMutation.mutate({ userId: u.id, roleId: branchRole.role.id, branchId: usersDialogBranch.id });
                              }
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUsersDialogBranch(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
