'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient, type PaginatedResponse } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

type CategoryOption = { id: string; name: string };

type Product = {
  id: string;
  sku: string;
  name: string;
  description?: string;
  salePrice: number;
  costPrice: number;
  minStock: number;
  unitOfMeasure: string;
  categoryId?: string;
  category?: { name: string };
  status: string;
  inventoryStock?: { quantity: number }[];
};

const productSchema = z.object({
  sku: z.string().min(1, 'El SKU es obligatorio'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional(),
  salePrice: z.coerce
    .number({ invalid_type_error: 'Ingresa un precio válido' })
    .min(0, 'El precio no puede ser negativo'),
  costPrice: z.coerce
    .number({ invalid_type_error: 'Ingresa un costo válido' })
    .min(0, 'El costo no puede ser negativo'),
  minStock: z.coerce
    .number({ invalid_type_error: 'Ingresa un stock mínimo válido' })
    .int('Debe ser un número entero')
    .min(0, 'No puede ser negativo'),
  unitOfMeasure: z.string().min(1, 'La unidad es obligatoria'),
  categoryId: z.string().optional(),
});

type ProductForm = z.infer<typeof productSchema>;

const EMPTY_FORM: Partial<ProductForm> = {
  sku: '',
  name: '',
  description: '',
  unitOfMeasure: 'unidad',
  categoryId: '',
};

export default function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Product>['data']>({
    queryKey: ['products', search, page],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/products', { params: { search, page, limit: 15 } });
        const p = data.data;
        return { items: Array.isArray(p.data) ? p.data : [], total: p.meta?.total ?? 0, page: p.meta?.page ?? 1, limit: p.meta?.limit ?? 15, totalPages: p.meta?.totalPages ?? 1 };
      } catch {
        return { items: [], total: 0, page: 1, limit: 15, totalPages: 1 };
      }
    },
  });

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: EMPTY_FORM as ProductForm,
  });

  const { formState: { errors }, watch, setValue } = form;
  const categoryIdVal = watch('categoryId') ?? '';

  const { data: categories } = useQuery<CategoryOption[]>({
    queryKey: ['categories-options'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/categories', { params: { flat: 'true' } });
        return Array.isArray(data.data) ? data.data : [];
      } catch { return []; }
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: ProductForm) => apiClient.post('/products', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setDialogOpen(false);
      toast({ title: 'Producto creado exitosamente' });
    },
    onError: () => {},
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProductForm }) =>
      apiClient.patch(`/products/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setDialogOpen(false);
      toast({ title: 'Producto actualizado' });
    },
    onError: () => {},
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Producto eliminado' });
    },
    onError: () => toast({ variant: 'destructive', title: 'Error al eliminar el producto' }),
  });

  function openCreate() {
    setEditing(null);
    form.reset(EMPTY_FORM as ProductForm);
    createMutation.reset();
    setDialogOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    form.reset({
      sku: product.sku,
      name: product.name,
      description: product.description ?? '',
      salePrice: product.salePrice,
      costPrice: product.costPrice,
      minStock: product.minStock,
      unitOfMeasure: product.unitOfMeasure,
      categoryId: product.categoryId ?? '',
    });
    updateMutation.reset();
    setDialogOpen(true);
  }

  function onSubmit(values: ProductForm) {
    const body = {
      ...values,
      categoryId: values.categoryId || undefined,
      description: values.description || undefined,
    };
    if (editing) updateMutation.mutate({ id: editing.id, body });
    else createMutation.mutate(body);
  }

  const products = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const activeMutation = editing ? updateMutation : createMutation;
  const backendError = activeMutation.error as { response?: { data?: { message?: string | string[] } } } | null;
  const errorMsg = (() => {
    const m = backendError?.response?.data?.message;
    if (!m) return null;
    return Array.isArray(m) ? m.join(', ') : m;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Productos</h2>
          <p className="text-muted-foreground text-sm">Gestiona el catálogo de productos</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo producto
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o SKU..."
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
                <TableHead>SKU</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(8)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(8)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : products.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No hay productos registrados
                      </TableCell>
                    </TableRow>
                  )
                : products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.category?.name ?? '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(p.salePrice))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(p.costPrice))}</TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const stock = p.inventoryStock?.reduce((s, i) => s + Number(i.quantity), 0) ?? 0;
                          return (
                            <span className={`flex items-center justify-center gap-1 ${stock <= p.minStock ? 'text-yellow-600' : ''}`}>
                              {stock <= p.minStock && <AlertTriangle className="h-3 w-3" />}
                              {stock}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.status === 'active' ? 'success' : 'secondary'}>
                          {p.status === 'active' ? 'Activo' : p.status === 'inactive' ? 'Inactivo' : p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`¿Eliminar "${p.name}"?`)) deleteMutation.mutate(p.id);
                            }}
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
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {errorMsg && (
              <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                {errorMsg}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="sku">SKU *</Label>
                <Input id="sku" {...form.register('sku')} placeholder="PROD-001" />
                {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="unitOfMeasure">Unidad *</Label>
                <Input id="unitOfMeasure" {...form.register('unitOfMeasure')} placeholder="unidad, kg, litro…" />
                {errors.unitOfMeasure && <p className="text-xs text-destructive">{errors.unitOfMeasure.message}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" {...form.register('name')} placeholder="Nombre del producto" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" {...form.register('description')} placeholder="Descripción opcional" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="salePrice">Precio de venta</Label>
                <Input
                  id="salePrice"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...form.register('salePrice')}
                />
                {errors.salePrice && <p className="text-xs text-destructive">{errors.salePrice.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="costPrice">Costo</Label>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...form.register('costPrice')}
                />
                {errors.costPrice && <p className="text-xs text-destructive">{errors.costPrice.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="minStock">Stock mínimo</Label>
                <Input
                  id="minStock"
                  type="number"
                  min="0"
                  placeholder="0"
                  {...form.register('minStock')}
                />
                {errors.minStock && <p className="text-xs text-destructive">{errors.minStock.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Categoría</Label>
                <Select
                  value={categoryIdVal ?? ''}
                  onValueChange={(v) => setValue('categoryId', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin categoría</SelectItem>
                    {(categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                  : 'Crear producto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
