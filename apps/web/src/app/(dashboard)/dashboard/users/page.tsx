'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient, type PaginatedResponse } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  role: { name: string };
};

type RoleOption = { id: string; name: string };

const createSchema = z.object({
  firstName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  lastName: z.string().min(2, 'El apellido debe tener al menos 2 caracteres'),
  email: z.string().email('Ingresa un correo electrónico válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  roleId: z.string().min(1, 'Selecciona un rol'),
});

const editSchema = z.object({
  firstName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  lastName: z.string().min(2, 'El apellido debe tener al menos 2 caracteres'),
  email: z.string().email('Ingresa un correo electrónico válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').optional().or(z.literal('')),
  roleId: z.string().min(1, 'Selecciona un rol'),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;
type UserForm = CreateForm | EditForm;

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const form = useForm<UserForm>({
    resolver: zodResolver(editing ? editSchema : createSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', roleId: '' },
  });

  const { formState: { errors } } = form;

  const { data, isLoading } = useQuery<PaginatedResponse<User>['data']>({
    queryKey: ['users', search, page],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/users', { params: { search, page, limit: 15 } });
        const p = data.data;
        return { items: Array.isArray(p.data) ? p.data : [], total: p.meta?.total ?? 0, page: p.meta?.page ?? 1, limit: p.meta?.limit ?? 15, totalPages: p.meta?.totalPages ?? 1 };
      } catch {
        return { items: [], total: 0, page: 1, limit: 15, totalPages: 1 };
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
    mutationFn: (body: CreateForm) => apiClient.post('/users', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setDialogOpen(false);
      toast({ title: 'Usuario creado exitosamente' });
    },
    onError: () => {},
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<EditForm> }) =>
      apiClient.patch(`/users/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setDialogOpen(false);
      toast({ title: 'Usuario actualizado' });
    },
    onError: () => {},
  });

  function openCreate() {
    setEditing(null);
    form.reset({ firstName: '', lastName: '', email: '', password: '', roleId: '' });
    createMutation.reset();
    setDialogOpen(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    form.reset({ firstName: u.firstName, lastName: u.lastName, email: u.email, password: '', roleId: '' });
    updateMutation.reset();
    setDialogOpen(true);
  }

  function onSubmit(values: UserForm) {
    if (editing) {
      const body = { ...values } as Partial<EditForm>;
      if (!body.password) delete body.password;
      updateMutation.mutate({ id: editing.id, body });
    } else {
      createMutation.mutate(values as CreateForm);
    }
  }

  const users = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const activeMutation = editing ? updateMutation : createMutation;
  const backendError = activeMutation.error as { response?: { data?: { message?: string | string[] } } } | null;
  const errorMsg = (() => { const m = backendError?.response?.data?.message; if (!m) return null; return Array.isArray(m) ? m.join(', ') : m; })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Usuarios</h2>
          <p className="text-muted-foreground text-sm">Gestiona los usuarios del sistema</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo usuario
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuario..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(8)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(5)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : users.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No hay usuarios registrados
                      </TableCell>
                    </TableRow>
                  )
                : users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10">
                              {getInitials(u.firstName, u.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{u.firstName} {u.lastName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell><Badge variant="outline">{u.role?.name ?? '—'}</Badge></TableCell>
                      <TableCell className="text-center">
                        <Badge variant={u.status === 'ACTIVE' ? 'success' : 'secondary'}>
                          {u.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm self-center text-muted-foreground">Pág. {page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {errorMsg && (
              <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                {errorMsg}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="firstName">Nombre *</Label>
                <Input id="firstName" {...form.register('firstName')} placeholder="Carlos" />
                {errors.firstName && (
                  <p className="text-xs text-destructive">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="lastName">Apellido *</Label>
                <Input id="lastName" {...form.register('lastName')} placeholder="García" />
                {errors.lastName && (
                  <p className="text-xs text-destructive">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="email">Correo electrónico *</Label>
              <Input id="email" type="email" {...form.register('email')} placeholder="usuario@empresa.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="password">
                Contraseña {editing ? '(dejar vacío para no cambiar)' : '*'}
              </Label>
              <Input id="password" type="password" {...form.register('password')} placeholder="Mínimo 8 caracteres" />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Rol *</Label>
              <Select
                onValueChange={(v) => form.setValue('roleId', v, { shouldValidate: true })}
                value={form.watch('roleId')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol…" />
                </SelectTrigger>
                <SelectContent>
                  {(roles ?? []).length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No hay roles disponibles
                    </div>
                  ) : (
                    (roles ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {errors.roleId && <p className="text-xs text-destructive">{errors.roleId.message}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={activeMutation.isPending}>
                {activeMutation.isPending
                  ? 'Guardando…'
                  : editing
                  ? 'Guardar cambios'
                  : 'Crear usuario'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
