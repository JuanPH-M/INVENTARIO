'use client';

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ChevronRight, Loader2, Package, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Category = { id: string; name: string; description?: string | null; _count?: { products: number } };
type Product = { id: string; sku: string | null; name: string; salePrice: number | string; status: string };

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  description: z.string().optional(),
});
type CategoryForm = z.infer<typeof schema>;

function CategoryProducts({ categoryId }: { categoryId: string }) {
  const { data, isLoading, isError, error } = useQuery<Paginated<Product>>({
    queryKey: ['products', { categoryId, limit: 50 }],
    queryFn: async () => (await apiClient.get('/products', { params: { categoryId, limit: 50 } })).data.data,
  });

  if (isLoading)
    return (
      <div className="space-y-1.5 px-6 py-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  if (isError) return <p className="px-6 py-3 text-sm text-destructive">{getErrorMessage(error)}</p>;

  const products = data?.data ?? [];
  if (products.length === 0)
    return (
      <p className="flex items-center gap-2 px-6 py-3 text-sm text-muted-foreground">
        <Package className="h-4 w-4" /> Esta categoría aún no tiene productos.
      </p>
    );

  return (
    <ul className="divide-y bg-muted/30">
      {products.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-2 pl-14 pr-4 text-sm">
          <span className="w-28 shrink-0 truncate font-mono text-xs text-muted-foreground">{p.sku ?? '—'}</span>
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          <span className="tabular-nums">{formatCurrency(Number(p.salePrice))}</span>
          {p.status !== 'active' && <Badge variant="secondary">Inactivo</Badge>}
        </li>
      ))}
      {(data?.meta.total ?? 0) > products.length && (
        <li className="py-2 pl-14 text-xs text-muted-foreground">y {(data?.meta.total ?? 0) - products.length} más...</li>
      )}
    </ul>
  );
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const canCreate = useCan('categories:create');
  const canUpdate = useCan('categories:update');
  const canDelete = useCan('categories:delete');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const form = useForm<CategoryForm>({ resolver: zodResolver(schema), defaultValues: { name: '', description: '' } });

  const { data = [], isLoading, isError, error, refetch } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await apiClient.get('/categories', { params: { flat: 'true' } });
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const categories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? data.filter((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)) : data;
  }, [data, search]);

  const save = useMutation({
    mutationFn: (body: CategoryForm) => (editing ? apiClient.patch(`/categories/${editing.id}`, body) : apiClient.post('/categories', body)),
    onSuccess: () => {
      toast({ title: editing ? 'Categoría actualizada' : 'Categoría creada' });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/categories/${id}`),
    onSuccess: () => {
      toast({ title: 'Categoría eliminada' });
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo eliminar', description: getErrorMessage(err) }),
  });

  const openForm = (c: Category | null) => {
    setEditing(c);
    form.reset({ name: c?.name ?? '', description: c?.description ?? '' });
    setOpen(true);
  };

  const totalProducts = data.reduce((s, c) => s + (c._count?.products ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorías"
        description={`${data.length} categorías · ${totalProducts} productos clasificados. Haz clic en una fila para ver sus productos.`}
        icon={Tags}
        actions={
          canCreate && (
            <Button onClick={() => openForm(null)}>
              <Plus /> Nueva categoría
            </Button>
          )
        }
      />

      <Card>
        <div className="border-b p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar categorías" className="pl-9" />
          </div>
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !isLoading && categories.length === 0 ? (
          <EmptyState
            icon={Tags}
            title={search ? 'Ninguna categoría coincide' : 'Aún no hay categorías'}
            description={search ? undefined : 'Las categorías agrupan tus productos y facilitan reportes y búsquedas.'}
            action={
              !search && canCreate ? (
                <Button onClick={() => openForm(null)}>
                  <Plus /> Nueva categoría
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Descripción</TableHead>
                <TableHead className="text-right">Productos</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : categories.map((c) => (
                    <Fragment key={c.id}>
                      <TableRow className="cursor-pointer" onClick={() => setExpanded((p) => (p === c.id ? null : c.id))}>
                        <TableCell>
                          {expanded === c.id ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">{c.description || '—'}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{c._count?.products ?? 0}</Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {canUpdate && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openForm(c)} aria-label="Editar">
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
                                    title: `¿Eliminar "${c.name}"?`,
                                    description: 'Los productos de esta categoría quedarán sin categoría.',
                                    destructive: true,
                                    confirmText: 'Eliminar',
                                  });
                                  if (ok) remove.mutate(c.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded === c.id && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={5} className="p-0">
                            <CategoryProducts categoryId={c.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Nombre *</Label>
              <Input id="cat-name" autoFocus {...form.register('name')} placeholder="Ej. Electrónica, Bebidas, Ropa..." />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Descripción</Label>
              <Input id="cat-desc" {...form.register('description')} placeholder="Opcional" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />}
                {editing ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
