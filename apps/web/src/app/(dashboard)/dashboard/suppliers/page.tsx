'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Store, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient, type PaginatedResponse } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

type Supplier = { id: string; name: string; email?: string; phone?: string; contactName?: string };
const schema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  contactName: z.string().optional(),
  notes: z.string().optional(),
});

export default function SuppliersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const { data, isLoading } = useQuery<PaginatedResponse<Supplier>['data']>({
    queryKey: ['suppliers', search, page],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/suppliers', { params: { search, page, limit: 15 } });
        const p = data.data;
        return { items: Array.isArray(p.data) ? p.data : [], total: p.meta?.total ?? 0, page: p.meta?.page ?? 1, limit: p.meta?.limit ?? 15, totalPages: p.meta?.totalPages ?? 1 };
      } catch {
        return { items: [], total: 0, page: 1, limit: 15, totalPages: 1 };
      }
    },
  });

  function cleanBody(body: z.infer<typeof schema>) {
    return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== '' && v !== null && v !== undefined));
  }

  const createMutation = useMutation({
    mutationFn: (body: z.infer<typeof schema>) => apiClient.post('/suppliers', cleanBody(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setDialogOpen(false); toast({ title: 'Proveedor creado' }); },
    onError: (e: { response?: { data?: { message?: string | string[] } } }) =>
      toast({ variant: 'destructive', title: Array.isArray(e.response?.data?.message) ? e.response!.data!.message!.join(', ') : (e.response?.data?.message ?? 'Error al crear proveedor') }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: z.infer<typeof schema> }) => apiClient.patch(`/suppliers/${id}`, cleanBody(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setDialogOpen(false); toast({ title: 'Proveedor actualizado' }); },
    onError: (e: { response?: { data?: { message?: string | string[] } } }) =>
      toast({ variant: 'destructive', title: Array.isArray(e.response?.data?.message) ? e.response!.data!.message!.join(', ') : (e.response?.data?.message ?? 'Error al actualizar proveedor') }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/suppliers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast({ title: 'Proveedor eliminado' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al eliminar' }),
  });

  function openCreate() { setEditing(null); form.reset({ name: '', email: '', phone: '', contactName: '', notes: '' }); setDialogOpen(true); }
  function openEdit(s: Supplier) { setEditing(s); form.reset({ name: s.name, email: s.email ?? '', phone: s.phone ?? '', contactName: s.contactName ?? '', notes: '' }); setDialogOpen(true); }

  const suppliers = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold">Proveedores</h2><p className="text-muted-foreground text-sm">Gestiona tus proveedores</p></div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nuevo proveedor</Button>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar proveedor..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Contacto</TableHead><TableHead>Email</TableHead><TableHead>Teléfono</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(8)].map((_, i) => <TableRow key={i}>{[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>)
                : suppliers.length === 0
                ? <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground"><Store className="h-8 w-8 mx-auto mb-2 opacity-50" />No hay proveedores</TableCell></TableRow>
                : suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.contactName ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{s.email ?? '-'}</TableCell>
                      <TableCell>{s.phone ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { if (confirm(`¿Eliminar "${s.name}"?`)) deleteMutation.mutate(s.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editing ? updateMutation.mutate({ id: editing.id, body: d }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1"><Label>Nombre empresa *</Label><Input {...form.register('name')} />{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Persona de contacto</Label><Input {...form.register('contactName')} /></div>
              <div className="space-y-1"><Label>Teléfono</Label><Input {...form.register('phone')} /></div>
            </div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" {...form.register('email')} />{form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}</div>
            <div className="space-y-1"><Label>Notas</Label><Input {...form.register('notes')} placeholder="Condiciones de pago, observaciones..." /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
