'use client';

import { confirm } from '@/components/common/confirm-dialog';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient, type PaginatedResponse } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

type Asset = {
  id: string;
  name: string;
  serialNumber?: string;
  brand?: string;
  acquisitionCost: number;
  status: string;
  branch?: { name: string };
  acquisitionDate: string;
};

type Branch = { id: string; name: string };

const schema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  branchId: z.string().uuid('Selecciona una sucursal'),
  acquisitionDate: z.string().min(1, 'La fecha de adquisición es requerida'),
  acquisitionCost: z.coerce.number({ invalid_type_error: 'Ingresa un costo válido' }).min(0, 'El costo no puede ser negativo'),
  serialNumber: z.string().optional(),
  brand: z.string().optional(),
  notes: z.string().optional(),
});

type AssetForm = z.infer<typeof schema>;

export default function AssetsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const form = useForm<AssetForm>({ resolver: zodResolver(schema) });
  const { formState: { errors }, watch, setValue } = form;
  const branchIdVal = watch('branchId');

  const { data, isLoading } = useQuery<PaginatedResponse<Asset>['data']>({
    queryKey: ['assets', search, page],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/assets', { params: { page, limit: 15, search } });
        const p = data.data;
        return { items: Array.isArray(p.data) ? p.data : [], total: p.meta?.total ?? 0, page: p.meta?.page ?? 1, limit: p.meta?.limit ?? 15, totalPages: p.meta?.totalPages ?? 1 };
      } catch {
        return { items: [], total: 0, page: 1, limit: 15, totalPages: 1 };
      }
    },
  });

  const { data: branches } = useQuery<Branch[]>({
    queryKey: ['branches-options'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/branches');
        return Array.isArray(data) ? data : (data.data?.items ?? data.data ?? []);
      } catch {
        return [];
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: AssetForm) => apiClient.post('/assets', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); setDialogOpen(false); toast({ title: 'Activo registrado' }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: AssetForm }) => apiClient.patch(`/assets/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); setDialogOpen(false); toast({ title: 'Activo actualizado' }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/assets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); toast({ title: 'Activo eliminado' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al eliminar activo' }),
  });

  const today = new Date().toISOString().split('T')[0];

  function openCreate() {
    setEditing(null);
    form.reset({ name: '', acquisitionDate: today, serialNumber: '', brand: '', notes: '' });
    createMutation.reset();
    setDialogOpen(true);
  }

  function openEdit(a: Asset) {
    setEditing(a);
    form.reset({
      name: a.name,
      acquisitionDate: a.acquisitionDate.split('T')[0],
      acquisitionCost: a.acquisitionCost,
      serialNumber: a.serialNumber ?? '',
      brand: a.brand ?? '',
    });
    updateMutation.reset();
    setDialogOpen(true);
  }

  function cleanBody(values: AssetForm) {
    return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined)) as AssetForm;
  }

  function onSubmit(values: AssetForm) {
    const body = cleanBody(values);
    if (editing) updateMutation.mutate({ id: editing.id, body });
    else createMutation.mutate(body);
  }

  const assets = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const activeMutation = editing ? updateMutation : createMutation;
  const backendError = activeMutation.error as { response?: { data?: { message?: string | string[] } } } | null;
  const errorMsg = (() => { const m = backendError?.response?.data?.message; if (!m) return null; return Array.isArray(m) ? m.join(', ') : m; })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Activos</h2>
          <p className="text-muted-foreground text-sm">Gestión de activos fijos de la empresa</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Nuevo activo</Button>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar activo..."
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
                <TableHead>Nombre</TableHead>
                <TableHead>Serie</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead className="text-right">Costo adquisición</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(8)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                : assets.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Box className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No hay activos registrados
                      </TableCell>
                    </TableRow>
                  )
                : assets.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="font-mono text-xs">{a.serialNumber ?? '-'}</TableCell>
                      <TableCell>{a.branch?.name ?? '-'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(a.acquisitionCost))}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={a.status === 'active' ? 'success' : 'secondary'}>{a.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={async () => { if (await confirm({ title: `¿Eliminar "${a.name}"?`, description: 'Esta acción no se puede deshacer.', destructive: true, confirmText: 'Confirmar' })) deleteMutation.mutate(a.id); }}
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
          <DialogHeader><DialogTitle>{editing ? 'Editar activo' : 'Nuevo activo'}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {errorMsg && (
              <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{errorMsg}</p>
            )}
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input {...form.register('name')} placeholder="Ej: Computadora Dell, Vehículo..." />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Sucursal *</Label>
              <Select
                value={branchIdVal ?? ''}
                onValueChange={(v) => setValue('branchId', v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {(branches ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.branchId && <p className="text-xs text-destructive">{errors.branchId.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Fecha de adquisición *</Label>
                <Input type="date" {...form.register('acquisitionDate')} />
                {errors.acquisitionDate && <p className="text-xs text-destructive">{errors.acquisitionDate.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Costo de adquisición *</Label>
                <Input type="number" step="0.01" min="0" placeholder="0.00" {...form.register('acquisitionCost')} />
                {errors.acquisitionCost && <p className="text-xs text-destructive">{errors.acquisitionCost.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>N° Serie</Label>
                <Input {...form.register('serialNumber')} placeholder="SN-001" />
              </div>
              <div className="space-y-1">
                <Label>Marca</Label>
                <Input {...form.register('brand')} placeholder="Dell, Toyota..." />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Input {...form.register('notes')} placeholder="Información adicional" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={activeMutation.isPending}>
                {activeMutation.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar activo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
