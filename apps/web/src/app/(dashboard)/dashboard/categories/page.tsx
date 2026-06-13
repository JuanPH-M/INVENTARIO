'use client';

import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pencil, Plus, Tag, Trash2, Package } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

type Category = { id: string; name: string; description?: string; _count?: { products: number } };
type Product = { id: string; sku: string; name: string; salePrice: number; status: string };

const schema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional(),
});

function CategoryProducts({ categoryId }: { categoryId: string }) {
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['category-products', categoryId],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/products', { params: { categoryId, limit: 100 } });
        const p = data.data;
        return Array.isArray(p.data) ? p.data : [];
      } catch { return []; }
    },
  });

  if (isLoading) return (
    <div className="px-4 py-2 space-y-1">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );

  if (!products || products.length === 0) {
    return (
      <div className="px-6 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Package className="h-4 w-4" />
        No hay productos en esta categoría
      </div>
    );
  }

  return (
    <div className="border-t bg-muted/30">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-10">SKU</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="text-right">Precio venta</TableHead>
            <TableHead className="text-center">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id} className="bg-muted/20">
              <TableCell className="pl-10 font-mono text-xs">{p.sku}</TableCell>
              <TableCell className="text-sm">{p.name}</TableCell>
              <TableCell className="text-right">{formatCurrency(Number(p.salePrice))}</TableCell>
              <TableCell className="text-center">
                <Badge variant={p.status === 'active' ? 'success' : 'secondary'} className="text-xs">
                  {p.status === 'active' ? 'Activo' : 'Inactivo'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const { data, isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/categories', { params: { flat: 'true' } });
        return Array.isArray(data.data) ? data.data : [];
      } catch {
        return [];
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: z.infer<typeof schema>) => apiClient.post('/categories', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setDialogOpen(false); toast({ title: 'Categoría creada' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al crear' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: z.infer<typeof schema> }) => apiClient.patch(`/categories/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setDialogOpen(false); toast({ title: 'Categoría actualizada' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al actualizar' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/categories/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast({ title: 'Categoría eliminada' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al eliminar' }),
  });

  function openCreate() { setEditing(null); form.reset({ name: '', description: '' }); setDialogOpen(true); }
  function openEdit(c: Category) { setEditing(c); form.reset({ name: c.name, description: c.description ?? '' }); setDialogOpen(true); }
  function toggleExpand(id: string) { setExpandedId(prev => prev === id ? null : id); }

  const categories = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Categorías</h2>
          <p className="text-muted-foreground text-sm">Organiza tus productos por categorías — haz clic en una fila para ver sus productos</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nueva categoría</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-center">Productos</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                : categories.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No hay categorías registradas
                      </TableCell>
                    </TableRow>
                  )
                : categories.map((c) => (
                    <Fragment key={c.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpand(c.id)}
                      >
                        <TableCell className="w-8">
                          {expandedId === c.id
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{c.description ?? '-'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{c._count?.products ?? 0}</Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => { if (confirm(`¿Eliminar "${c.name}"?`)) deleteMutation.mutate(c.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedId === c.id && (
                        <TableRow>
                          <TableCell colSpan={5} className="p-0">
                            <CategoryProducts categoryId={c.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editing ? updateMutation.mutate({ id: editing.id, body: d }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input {...form.register('name')} placeholder="Ej: Electrónica, Alimentos..." />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Input {...form.register('description')} placeholder="Descripción opcional" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
