'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Loader2, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { cn, formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
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
import { Paginator } from '@/components/ui/paginator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Product = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  salePrice: number | string;
  costPrice: number | string;
  taxRate: number | string;
  minStock: number | string;
  unitOfMeasure: string;
  categoryId: string | null;
  category?: { name: string } | null;
  status: string;
  inventoryStock?: { quantity: number | string; reserved: number | string }[];
};

const STATUS: Record<string, { label: string; tone: 'success' | 'secondary' | 'warning' | 'destructive' }> = {
  active: { label: 'Activo', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'secondary' },
  draft: { label: 'Borrador', tone: 'warning' },
  discontinued: { label: 'Descontinuado', tone: 'destructive' },
};

const money = z.coerce.number({ invalid_type_error: 'Ingresa un valor válido' }).min(0, 'No puede ser negativo');

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  sku: z.string().trim().max(100).optional(),
  barcode: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(200).optional(),
  description: z.string().optional(),
  salePrice: money,
  costPrice: money,
  taxRate: z.coerce.number().min(0).max(100, 'Máximo 100 %'),
  minStock: z.coerce.number().int('Debe ser entero').min(0, 'No puede ser negativo'),
  unitOfMeasure: z.string().trim().min(1, 'Obligatorio'),
  categoryId: z.string().optional(),
  status: z.string().optional(),
});

type ProductForm = z.infer<typeof schema>;

const EMPTY: ProductForm = {
  name: '',
  sku: '',
  barcode: '',
  brand: '',
  description: '',
  salePrice: 0,
  costPrice: 0,
  taxRate: 0,
  minStock: 0,
  unitOfMeasure: 'unidad',
  categoryId: '',
  status: 'active',
};

const stockOf = (p: Product) => (p.inventoryStock ?? []).reduce((s, i) => s + Number(i.quantity) - Number(i.reserved ?? 0), 0);

export default function ProductsPage() {
  const qc = useQueryClient();
  const canCreate = useCan('products:create');
  const canUpdate = useCan('products:update');
  const canDelete = useCan('products:delete');

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const debounced = useDebounce(search);

  const params = {
    page,
    limit: 20,
    search: debounced.trim() || undefined,
    categoryId: categoryId === 'all' ? undefined : categoryId,
    status: status === 'all' ? undefined : status,
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Paginated<Product>>({
    queryKey: ['products', params],
    queryFn: async () => (await apiClient.get('/products', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await apiClient.get('/categories', { params: { flat: 'true' } });
      return Array.isArray(data.data) ? data.data : [];
    },
    staleTime: 5 * 60_000,
  });

  const form = useForm<ProductForm>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { errors } = form.formState;
  const [salePrice, costPrice] = form.watch(['salePrice', 'costPrice']);
  const margin = Number(salePrice) > 0 ? ((Number(salePrice) - Number(costPrice)) / Number(salePrice)) * 100 : 0;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['products'] });
  };

  const save = useMutation({
    mutationFn: async (values: ProductForm) => {
      const body = {
        ...values,
        sku: values.sku || undefined,
        barcode: values.barcode || undefined,
        brand: values.brand || undefined,
        description: values.description || undefined,
        categoryId: values.categoryId || undefined,
        status: editing ? values.status : undefined,
      };
      return editing ? apiClient.patch(`/products/${editing.id}`, body) : apiClient.post('/products', body);
    },
    onSuccess: () => {
      toast({ title: editing ? 'Producto actualizado' : 'Producto creado' });
      setOpen(false);
      invalidate();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/products/${id}`),
    onSuccess: () => {
      toast({ title: 'Producto eliminado' });
      invalidate();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo eliminar', description: getErrorMessage(err) }),
  });

  const openForm = (p: Product | null) => {
    setEditing(p);
    form.reset(
      p
        ? {
            name: p.name,
            sku: p.sku ?? '',
            barcode: p.barcode ?? '',
            brand: p.brand ?? '',
            description: p.description ?? '',
            salePrice: Number(p.salePrice),
            costPrice: Number(p.costPrice),
            taxRate: Number(p.taxRate ?? 0),
            minStock: Number(p.minStock),
            unitOfMeasure: p.unitOfMeasure,
            categoryId: p.categoryId ?? '',
            status: p.status,
          }
        : EMPTY,
    );
    setOpen(true);
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const filtered = !!(params.search || params.categoryId || params.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        description="Catálogo con precios, costos, márgenes y existencias en todas las sedes"
        icon={Package}
        actions={
          canCreate && (
            <Button onClick={() => openForm(null)}>
              <Plus /> Nuevo producto
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre, SKU, código o código de barras"
              className="pl-9"
            />
            {isFetching && !isLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1); }}>
            <SelectTrigger className="md:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(STATUS).map(([v, s]) => (
                <SelectItem key={v} value={v}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !isLoading && rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title={filtered ? 'Ningún producto coincide con los filtros' : 'Aún no hay productos'}
            description={filtered ? 'Prueba con otra búsqueda o limpia los filtros.' : 'Crea tu primer producto para empezar a vender e inventariar.'}
            action={
              !filtered && canCreate ? (
                <Button onClick={() => openForm(null)}>
                  <Plus /> Nuevo producto
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="hidden lg:table-cell">Categoría</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Margen</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="hidden sm:table-cell">Estado</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody className={cn(isFetching && !isLoading && 'opacity-70 transition-opacity')}>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : rows.map((p) => {
                      const stock = stockOf(p);
                      const low = stock <= Number(p.minStock);
                      const sale = Number(p.salePrice);
                      const m = sale > 0 ? ((sale - Number(p.costPrice)) / sale) * 100 : 0;
                      const st = STATUS[p.status] ?? { label: p.status, tone: 'secondary' as const };
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <p className="font-medium">{p.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {[p.sku, p.brand].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">{p.category?.name ?? '—'}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatCurrency(sale)}</TableCell>
                          <TableCell className={cn('hidden text-right tabular-nums md:table-cell', m < 15 ? 'text-warning' : 'text-success')}>
                            {m.toFixed(1)} %
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={cn('inline-flex items-center gap-1', low && 'font-semibold text-warning')}>
                              {low && <AlertTriangle className="h-3.5 w-3.5" />}
                              {stock} <span className="text-xs font-normal text-muted-foreground">{p.unitOfMeasure}</span>
                            </span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={st.tone}>{st.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              {canUpdate && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openForm(p)} aria-label="Editar">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  aria-label="Eliminar"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: `¿Eliminar "${p.name}"?`,
                                      description: 'El producto dejará de aparecer en el catálogo y el POS. El historial se conserva.',
                                      destructive: true,
                                      confirmText: 'Eliminar',
                                    });
                                    if (ok) remove.mutate(p.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
            {meta && (
              <div className="border-t px-4 pb-3">
                <Paginator page={meta.page} totalPages={meta.totalPages} total={meta.total} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
            <DialogDescription>Los campos con * son obligatorios. El stock se gestiona desde Inventario y Compras.</DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" autoFocus {...form.register('name')} placeholder="Ej. Camiseta básica algodón" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" {...form.register('sku')} placeholder="CAM-001" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="barcode">Código de barras</Label>
                <Input id="barcode" {...form.register('barcode')} placeholder="7701234567890" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand">Marca</Label>
                <Input id="brand" {...form.register('brand')} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.watch('categoryId') || '__none__'} onValueChange={(v) => form.setValue('categoryId', v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin categoría</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitOfMeasure">Unidad de medida *</Label>
                <Input id="unitOfMeasure" {...form.register('unitOfMeasure')} placeholder="unidad, kg, litro..." />
                {errors.unitOfMeasure && <p className="text-xs text-destructive">{errors.unitOfMeasure.message}</p>}
              </div>
            </div>

            <div className="grid gap-4 rounded-xl bg-muted/40 p-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="costPrice">Costo</Label>
                <Input id="costPrice" type="number" step="0.01" min="0" {...form.register('costPrice')} />
                {errors.costPrice && <p className="text-xs text-destructive">{errors.costPrice.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salePrice">Precio de venta</Label>
                <Input id="salePrice" type="number" step="0.01" min="0" {...form.register('salePrice')} />
                {errors.salePrice && <p className="text-xs text-destructive">{errors.salePrice.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taxRate">Impuesto (%)</Label>
                <Input id="taxRate" type="number" step="0.01" min="0" max="100" {...form.register('taxRate')} />
                {errors.taxRate && <p className="text-xs text-destructive">{errors.taxRate.message}</p>}
              </div>
              <p className={cn('text-xs sm:col-span-3', margin < 0 ? 'text-destructive' : margin < 15 ? 'text-warning' : 'text-success')}>
                Margen bruto: <strong>{margin.toFixed(1)} %</strong>
                {Number(salePrice) > 0 && <> · ganancia por unidad {formatCurrency(Number(salePrice) - Number(costPrice))}</>}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="minStock">Stock mínimo (alerta)</Label>
                <Input id="minStock" type="number" min="0" {...form.register('minStock')} />
                {errors.minStock && <p className="text-xs text-destructive">{errors.minStock.message}</p>}
              </div>
              {editing && (
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={form.watch('status')} onValueChange={(v) => form.setValue('status', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS).map(([v, s]) => (
                        <SelectItem key={v} value={v}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descripción</Label>
              <textarea
                id="description"
                rows={2}
                {...form.register('description')}
                className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />}
                {editing ? 'Guardar cambios' : 'Crear producto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
