'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient, type PaginatedResponse } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

type Client = {
  id: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  idType: string;
  idNumber: string;
};

const clientSchema = z.object({
  idType: z.string().min(1, 'Tipo de documento requerido'),
  idNumber: z.string().min(1, 'Número de documento requerido'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
});

type ClientForm = z.infer<typeof clientSchema>;

const ID_TYPES = ['CC', 'NIT', 'Pasaporte', 'CE', 'RUT', 'Otro'];

export default function ClientsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Client>['data']>({
    queryKey: ['clients', search, page],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/clients', { params: { search, page, limit: 15 } });
        const p = data.data;
        return { items: Array.isArray(p.data) ? p.data : [], total: p.meta?.total ?? 0, page: p.meta?.page ?? 1, limit: p.meta?.limit ?? 15, totalPages: p.meta?.totalPages ?? 1 };
      } catch {
        return { items: [], total: 0, page: 1, limit: 15, totalPages: 1 };
      }
    },
  });

  const form = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: { idType: '', idNumber: '', firstName: '', lastName: '', email: '', phone: '' },
  });
  const { formState: { errors }, watch, setValue } = form;
  const idTypeVal = watch('idType');

  function cleanBody(body: ClientForm) {
    return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== '' && v !== null && v !== undefined));
  }

  const createMutation = useMutation({
    mutationFn: (body: ClientForm) => apiClient.post('/clients', cleanBody(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setDialogOpen(false); toast({ title: 'Cliente creado' }); },
    onError: () => {},
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ClientForm }) => apiClient.patch(`/clients/${id}`, cleanBody(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setDialogOpen(false); toast({ title: 'Cliente actualizado' }); },
    onError: () => {},
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/clients/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); toast({ title: 'Cliente eliminado' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al eliminar cliente' }),
  });

  function openCreate() {
    setEditing(null);
    form.reset({ idType: 'CC', idNumber: '', firstName: '', lastName: '', email: '', phone: '' });
    createMutation.reset();
    setDialogOpen(true);
  }

  function openEdit(c: Client) {
    setEditing(c);
    form.reset({
      idType: c.idType,
      idNumber: c.idNumber,
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
    });
    updateMutation.reset();
    setDialogOpen(true);
  }

  function onSubmit(values: ClientForm) {
    if (editing) updateMutation.mutate({ id: editing.id, body: values });
    else createMutation.mutate(values);
  }

  const clients = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const activeMutation = editing ? updateMutation : createMutation;
  const backendError = activeMutation.error as { response?: { data?: { message?: string | string[] } } } | null;
  const errorMsg = (() => { const m = backendError?.response?.data?.message; if (!m) return null; return Array.isArray(m) ? m.join(', ') : m; })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Clientes</h2>
          <p className="text-muted-foreground text-sm">Gestiona la base de clientes</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Nuevo cliente</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email o documento..."
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
                <TableHead>Nombre / Empresa</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(8)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                : clients.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No hay clientes registrados
                      </TableCell>
                    </TableRow>
                  )
                : clients.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.businessName ?? (`${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '-')}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.idType} {c.idNumber}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.email ?? '-'}</TableCell>
                      <TableCell className="text-sm">{c.phone ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => { if (confirm(`¿Eliminar cliente?`)) deleteMutation.mutate(c.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-sm self-center text-muted-foreground">Pág. {page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {errorMsg && (
              <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{errorMsg}</p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo de documento *</Label>
                <Select value={idTypeVal} onValueChange={(v) => setValue('idType', v, { shouldValidate: true })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.idType && <p className="text-xs text-destructive">{errors.idType.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>N° Documento *</Label>
                <Input {...form.register('idNumber')} placeholder="123456789" />
                {errors.idNumber && <p className="text-xs text-destructive">{errors.idNumber.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input {...form.register('firstName')} placeholder="Nombre" />
              </div>
              <div className="space-y-1">
                <Label>Apellido</Label>
                <Input {...form.register('lastName')} placeholder="Apellido" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" {...form.register('email')} placeholder="correo@ejemplo.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input {...form.register('phone')} placeholder="+57 300 000 0000" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={activeMutation.isPending}>
                {activeMutation.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
