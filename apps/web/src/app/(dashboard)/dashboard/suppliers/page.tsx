'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Globe, Loader2, Mail, Pencil, Phone, Plus, Search, Trash2, Truck } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { cn } from '@/lib/utils';
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

type Supplier = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  paymentTerms: number;
  notes: string | null;
  status: string;
};

const STATUS: Record<string, { label: string; tone: 'success' | 'secondary' | 'destructive' }> = {
  active: { label: 'Activo', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'secondary' },
  blacklisted: { label: 'Vetado', tone: 'destructive' },
};

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  legalName: z.string().trim().optional(),
  taxId: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  email: z.string().trim().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  website: z.string().trim().optional(),
  paymentTerms: z.coerce.number().int('Días enteros').min(0).max(365),
  notes: z.string().optional(),
  status: z.string().optional(),
});
type SupplierForm = z.infer<typeof schema>;

const EMPTY: SupplierForm = {
  name: '',
  legalName: '',
  taxId: '',
  contactName: '',
  email: '',
  phone: '',
  website: '',
  paymentTerms: 30,
  notes: '',
  status: 'active',
};

export default function SuppliersPage() {
  const qc = useQueryClient();
  const canCreate = useCan('suppliers:create');
  const canUpdate = useCan('suppliers:update');
  const canDelete = useCan('suppliers:delete');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const debounced = useDebounce(search);

  const params = { page, limit: 20, search: debounced.trim() || undefined };
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Paginated<Supplier>>({
    queryKey: ['suppliers', params],
    queryFn: async () => (await apiClient.get('/suppliers', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  const form = useForm<SupplierForm>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: (v: SupplierForm) => {
      const body = Object.fromEntries(
        Object.entries({ ...v, status: editing ? v.status : undefined }).filter(([, val]) => val !== '' && val !== undefined),
      );
      return editing ? apiClient.patch(`/suppliers/${editing.id}`, body) : apiClient.post('/suppliers', body);
    },
    onSuccess: () => {
      toast({ title: editing ? 'Proveedor actualizado' : 'Proveedor creado' });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/suppliers/${id}`),
    onSuccess: () => {
      toast({ title: 'Proveedor eliminado' });
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo eliminar', description: getErrorMessage(err) }),
  });

  const openForm = (s: Supplier | null) => {
    setEditing(s);
    form.reset(
      s
        ? {
            name: s.name,
            legalName: s.legalName ?? '',
            taxId: s.taxId ?? '',
            contactName: s.contactName ?? '',
            email: s.email ?? '',
            phone: s.phone ?? '',
            website: s.website ?? '',
            paymentTerms: s.paymentTerms ?? 30,
            notes: s.notes ?? '',
            status: s.status,
          }
        : EMPTY,
    );
    setOpen(true);
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proveedores"
        description="Directorio de proveedores, condiciones de pago y datos de contacto"
        icon={Truck}
        actions={
          canCreate && (
            <Button onClick={() => openForm(null)}>
              <Plus /> Nuevo proveedor
            </Button>
          )
        }
      />

      <Card>
        <div className="border-b p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre o correo"
              className="pl-9"
            />
            {isFetching && !isLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !isLoading && rows.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={params.search ? 'Ningún proveedor coincide' : 'Aún no hay proveedores'}
            description={params.search ? undefined : 'Registra a quién le compras para crear órdenes de compra y recibir mercancía.'}
            action={
              !params.search && canCreate ? (
                <Button onClick={() => openForm(null)}>
                  <Plus /> Nuevo proveedor
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="hidden md:table-cell">Contacto</TableHead>
                  <TableHead className="hidden lg:table-cell">Plazo de pago</TableHead>
                  <TableHead className="hidden sm:table-cell">Estado</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody className={cn(isFetching && !isLoading && 'opacity-70 transition-opacity')}>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : rows.map((s) => {
                      const st = STATUS[s.status] ?? { label: s.status, tone: 'secondary' as const };
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <p className="font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{[s.legalName, s.taxId && `NIT ${s.taxId}`].filter(Boolean).join(' · ') || '—'}</p>
                          </TableCell>
                          <TableCell className="hidden text-sm md:table-cell">
                            {s.contactName && <p>{s.contactName}</p>}
                            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                              {s.email && (
                                <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                                  <Mail className="h-3 w-3" /> {s.email}
                                </a>
                              )}
                              {s.phone && (
                                <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                                  <Phone className="h-3 w-3" /> {s.phone}
                                </a>
                              )}
                              {s.website && (
                                <a
                                  href={s.website.startsWith('http') ? s.website : `https://${s.website}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 hover:text-foreground"
                                >
                                  <Globe className="h-3 w-3" /> Web
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-sm lg:table-cell">
                            {s.paymentTerms ? `${s.paymentTerms} días` : 'De contado'}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={st.tone}>{st.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              {canUpdate && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openForm(s)} aria-label="Editar">
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
                                      title: `¿Eliminar "${s.name}"?`,
                                      description: 'Las órdenes de compra anteriores se conservan.',
                                      destructive: true,
                                      confirmText: 'Eliminar',
                                    });
                                    if (ok) remove.mutate(s.id);
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
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
            <DialogDescription>Solo el nombre es obligatorio.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre comercial *</Label>
              <Input id="name" autoFocus {...form.register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="legalName">Razón social</Label>
                <Input id="legalName" {...form.register('legalName')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taxId">NIT / identificación tributaria</Label>
                <Input id="taxId" {...form.register('taxId')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactName">Persona de contacto</Label>
                <Input id="contactName" {...form.register('contactName')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" {...form.register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" type="email" {...form.register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Sitio web</Label>
                <Input id="website" {...form.register('website')} placeholder="www.proveedor.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paymentTerms">Plazo de pago (días)</Label>
                <Input id="paymentTerms" type="number" min="0" max="365" {...form.register('paymentTerms')} />
                {errors.paymentTerms && <p className="text-xs text-destructive">{errors.paymentTerms.message}</p>}
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
              <Label htmlFor="notes">Notas</Label>
              <Input id="notes" {...form.register('notes')} placeholder="Condiciones, descuentos, horarios de entrega..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />}
                {editing ? 'Guardar cambios' : 'Crear proveedor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
