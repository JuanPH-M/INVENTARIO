'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Boxes, Loader2, Pencil, Plus, Search, Trash2, Wrench } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useCan } from '@/hooks/use-can';
import { useBranches } from '@/hooks/use-branches';
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

type Asset = {
  id: string;
  name: string;
  internalCode: string | null;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  status: string;
  branchId: string;
  branch?: { name: string };
  acquisitionDate: string;
  acquisitionCost: number | string;
  usefulLifeYears: number | null;
  residualValue: number | string;
  depreciationMethod: string;
  warrantyExpires: string | null;
  nextMaintenance: string | null;
  location: string | null;
  notes: string | null;
};

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'destructive' | 'secondary' | 'info' }> = {
  active: { label: 'En uso', tone: 'success' },
  maintenance: { label: 'En mantenimiento', tone: 'info' },
  repair: { label: 'En reparación', tone: 'warning' },
  retired: { label: 'Retirado', tone: 'secondary' },
  disposed: { label: 'Dado de baja', tone: 'secondary' },
  stolen: { label: 'Robado / perdido', tone: 'destructive' },
};

const today = () => new Date().toISOString().slice(0, 10);
const day = (d: string | null) => (d ? d.slice(0, 10) : '');

/** Valor en libros con depreciación en línea recta (si el activo tiene vida útil). */
function bookValue(a: Asset): number {
  const cost = Number(a.acquisitionCost);
  if (a.depreciationMethod === 'none' || !a.usefulLifeYears) return cost;
  const years = (Date.now() - new Date(a.acquisitionDate).getTime()) / (365.25 * 86_400_000);
  const residual = Number(a.residualValue ?? 0);
  return Math.max(residual, cost - ((cost - residual) * Math.min(Math.max(years, 0), a.usefulLifeYears)) / a.usefulLifeYears);
}

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  branchId: z.string().uuid('Selecciona una sede'),
  internalCode: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  model: z.string().trim().optional(),
  location: z.string().trim().optional(),
  acquisitionDate: z.string().min(1, 'Obligatoria'),
  acquisitionCost: z.coerce.number().min(0, 'No puede ser negativo'),
  usefulLifeYears: z.coerce.number().int().min(0).max(100),
  residualValue: z.coerce.number().min(0),
  warrantyExpires: z.string().optional(),
  nextMaintenance: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
});
type AssetForm = z.infer<typeof schema>;

const maintSchema = z.object({
  type: z.enum(['preventive', 'corrective', 'emergency']),
  description: z.string().trim().min(3, 'Describe el trabajo realizado'),
  cost: z.coerce.number().min(0),
  nextScheduled: z.string().optional(),
});
type MaintForm = z.infer<typeof maintSchema>;

export default function AssetsPage() {
  const qc = useQueryClient();
  const canCreate = useCan('assets:create');
  const canUpdate = useCan('assets:update');
  const canDelete = useCan('assets:delete');
  const canMaint = useCan('assets:manage_maintenance');
  const { data: branches = [] } = useBranches();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [branchId, setBranchId] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [maintFor, setMaintFor] = useState<Asset | null>(null);
  const debounced = useDebounce(search);

  const params = {
    page,
    limit: 20,
    search: debounced.trim() || undefined,
    status: status === 'all' ? undefined : status,
    branchId: branchId === 'all' ? undefined : branchId,
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Paginated<Asset>>({
    queryKey: ['assets', params],
    queryFn: async () => (await apiClient.get('/assets', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  const { data: due = [] } = useQuery<Asset[]>({
    queryKey: ['assets', 'maintenance-due'],
    queryFn: async () => (await apiClient.get('/assets/maintenance-due')).data.data ?? [],
  });

  const form = useForm<AssetForm>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;
  const maint = useForm<MaintForm>({ resolver: zodResolver(maintSchema), defaultValues: { type: 'preventive', description: '', cost: 0, nextScheduled: '' } });

  const save = useMutation({
    mutationFn: (v: AssetForm) => {
      const body: Record<string, unknown> = Object.fromEntries(
        Object.entries({ ...v, status: editing ? v.status : undefined }).filter(([, val]) => val !== '' && val !== undefined),
      );
      if (!v.usefulLifeYears) {
        delete body['usefulLifeYears'];
        body['depreciationMethod'] = 'none';
      } else body['depreciationMethod'] = 'straight_line';
      return editing ? apiClient.patch(`/assets/${editing.id}`, body) : apiClient.post('/assets', body);
    },
    onSuccess: () => {
      toast({ title: editing ? 'Activo actualizado' : 'Activo registrado' });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) }),
  });

  const addMaint = useMutation({
    mutationFn: (v: MaintForm) =>
      apiClient.post(`/assets/${maintFor?.id}/maintenance`, { ...v, nextScheduled: v.nextScheduled || undefined }),
    onSuccess: () => {
      toast({ title: 'Mantenimiento registrado' });
      setMaintFor(null);
      void qc.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo registrar', description: getErrorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/assets/${id}`),
    onSuccess: () => {
      toast({ title: 'Activo retirado' });
      void qc.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo retirar', description: getErrorMessage(err) }),
  });

  const openForm = (a: Asset | null) => {
    setEditing(a);
    form.reset(
      a
        ? {
            name: a.name,
            branchId: a.branchId,
            internalCode: a.internalCode ?? '',
            serialNumber: a.serialNumber ?? '',
            brand: a.brand ?? '',
            model: a.model ?? '',
            location: a.location ?? '',
            acquisitionDate: day(a.acquisitionDate),
            acquisitionCost: Number(a.acquisitionCost),
            usefulLifeYears: a.usefulLifeYears ?? 0,
            residualValue: Number(a.residualValue ?? 0),
            warrantyExpires: day(a.warrantyExpires),
            nextMaintenance: day(a.nextMaintenance),
            notes: a.notes ?? '',
            status: a.status,
          }
        : {
            name: '',
            branchId: branchId !== 'all' ? branchId : branches[0]?.id ?? '',
            acquisitionDate: today(),
            acquisitionCost: 0,
            usefulLifeYears: 5,
            residualValue: 0,
            status: 'active',
          },
    );
    setOpen(true);
  };

  const openMaint = (a: Asset) => {
    maint.reset({ type: 'preventive', description: '', cost: 0, nextScheduled: '' });
    setMaintFor(a);
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const filtered = !!(params.search || params.status || params.branchId);
  const pageCost = rows.reduce((s, a) => s + Number(a.acquisitionCost), 0);
  const pageBook = rows.reduce((s, a) => s + bookValue(a), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activos fijos"
        description="Equipos, mobiliario y vehículos por sede, con depreciación y mantenimientos"
        icon={Boxes}
        actions={
          canCreate && (
            <Button onClick={() => openForm(null)} disabled={branches.length === 0}>
              <Plus /> Nuevo activo
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Activos registrados</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{meta?.total ?? '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Valor en libros (esta página)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(pageBook)}</p>
          <p className="text-xs text-muted-foreground">Costo de compra {formatCurrency(pageCost)}</p>
        </Card>
        <Card className={cn('p-4', due.length > 0 && 'border-warning/50 bg-warning/5')}>
          <p className="text-xs font-medium text-muted-foreground">Mantenimiento en los próximos 7 días</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums', due.length > 0 && 'text-warning')}>{due.length}</p>
          {due.length > 0 && <p className="truncate text-xs text-muted-foreground">{due.slice(0, 3).map((a) => a.name).join(', ')}</p>}
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre, serie, código o marca"
              className="pl-9"
            />
            {isFetching && !isLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {branches.length > 1 && (
            <Select value={branchId} onValueChange={(v) => { setBranchId(v); setPage(1); }}>
              <SelectTrigger className="lg:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sedes</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="lg:w-48">
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
            icon={Boxes}
            title={filtered ? 'Ningún activo coincide' : 'Aún no hay activos'}
            description={filtered ? 'Prueba con otros filtros.' : 'Registra computadores, neveras, estanterías o vehículos para controlar su valor y mantenimientos.'}
            action={
              !filtered && canCreate && branches.length > 0 ? (
                <Button onClick={() => openForm(null)}>
                  <Plus /> Nuevo activo
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activo</TableHead>
                  <TableHead className="hidden md:table-cell">Sede</TableHead>
                  <TableHead className="text-right">Valor en libros</TableHead>
                  <TableHead className="hidden lg:table-cell">Próx. mantenimiento</TableHead>
                  <TableHead className="hidden sm:table-cell">Estado</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody className={cn(isFetching && !isLoading && 'opacity-70 transition-opacity')}>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : rows.map((a) => {
                      const st = STATUS[a.status] ?? { label: a.status, tone: 'secondary' as const };
                      const overdue = a.nextMaintenance && new Date(a.nextMaintenance).getTime() < Date.now();
                      return (
                        <TableRow key={a.id}>
                          <TableCell>
                            <p className="font-medium">{a.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {[a.internalCode, a.serialNumber && `S/N ${a.serialNumber}`, a.brand].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </TableCell>
                          <TableCell className="hidden text-sm md:table-cell">
                            {a.branch?.name ?? '—'}
                            {a.location && <span className="block text-xs text-muted-foreground">{a.location}</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <p className="font-medium">{formatCurrency(bookValue(a))}</p>
                            <p className="text-xs text-muted-foreground">de {formatCurrency(Number(a.acquisitionCost))}</p>
                          </TableCell>
                          <TableCell className="hidden text-sm lg:table-cell">
                            {a.nextMaintenance ? (
                              <span className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-destructive')}>
                                {overdue && <AlertTriangle className="h-3.5 w-3.5" />}
                                {formatDate(a.nextMaintenance)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={st.tone}>{st.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              {canMaint && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openMaint(a)} aria-label="Registrar mantenimiento">
                                  <Wrench className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {canUpdate && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openForm(a)} aria-label="Editar">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  aria-label="Retirar"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: `¿Retirar "${a.name}"?`,
                                      description: 'El activo se marcará como retirado y saldrá del listado.',
                                      destructive: true,
                                      confirmText: 'Retirar',
                                    });
                                    if (ok) remove.mutate(a.id);
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
            <DialogTitle>{editing ? 'Editar activo' : 'Nuevo activo'}</DialogTitle>
            <DialogDescription>Deja la vida útil en 0 si el activo no se deprecia.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="a-name">Nombre *</Label>
                <Input id="a-name" autoFocus {...form.register('name')} placeholder="Ej. Computador de caja, Nevera exhibidora" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Sede *</Label>
                <Select value={form.watch('branchId') ?? ''} onValueChange={(v) => form.setValue('branchId', v, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.branchId && <p className="text-xs text-destructive">{errors.branchId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-loc">Ubicación</Label>
                <Input id="a-loc" {...form.register('location')} placeholder="Bodega, caja 2..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-code">Código interno</Label>
                <Input id="a-code" {...form.register('internalCode')} placeholder="ACT-0001" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-serial">N.º de serie</Label>
                <Input id="a-serial" {...form.register('serialNumber')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-brand">Marca</Label>
                <Input id="a-brand" {...form.register('brand')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-model">Modelo</Label>
                <Input id="a-model" {...form.register('model')} />
              </div>
            </div>

            <div className="grid gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="a-date">Fecha de compra *</Label>
                <Input id="a-date" type="date" {...form.register('acquisitionDate')} />
                {errors.acquisitionDate && <p className="text-xs text-destructive">{errors.acquisitionDate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-cost">Costo de compra *</Label>
                <Input id="a-cost" type="number" min="0" step="0.01" {...form.register('acquisitionCost')} />
                {errors.acquisitionCost && <p className="text-xs text-destructive">{errors.acquisitionCost.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-life">Vida útil (años)</Label>
                <Input id="a-life" type="number" min="0" max="100" {...form.register('usefulLifeYears')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-res">Valor residual</Label>
                <Input id="a-res" type="number" min="0" step="0.01" {...form.register('residualValue')} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="a-warr">Garantía hasta</Label>
                <Input id="a-warr" type="date" {...form.register('warrantyExpires')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-next">Próximo mantenimiento</Label>
                <Input id="a-next" type="date" {...form.register('nextMaintenance')} />
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
              <div className={cn('space-y-1.5', !editing && 'sm:col-span-2')}>
                <Label htmlFor="a-notes">Notas</Label>
                <Input id="a-notes" {...form.register('notes')} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />}
                {editing ? 'Guardar cambios' : 'Registrar activo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!maintFor} onOpenChange={(o) => !o && setMaintFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar mantenimiento</DialogTitle>
            <DialogDescription>{maintFor?.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={maint.handleSubmit((v) => addMaint.mutate(v))} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={maint.watch('type')} onValueChange={(v) => maint.setValue('type', v as MaintForm['type'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventive">Preventivo</SelectItem>
                    <SelectItem value="corrective">Correctivo</SelectItem>
                    <SelectItem value="emergency">Emergencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-cost">Costo</Label>
                <Input id="m-cost" type="number" min="0" step="0.01" {...maint.register('cost')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-desc">Trabajo realizado *</Label>
              <Input id="m-desc" {...maint.register('description')} placeholder="Limpieza, cambio de repuesto..." />
              {maint.formState.errors.description && <p className="text-xs text-destructive">{maint.formState.errors.description.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-next">Próximo mantenimiento</Label>
              <Input id="m-next" type="date" min={today()} {...maint.register('nextScheduled')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMaintFor(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={addMaint.isPending}>
                {addMaint.isPending ? <Loader2 className="animate-spin" /> : <Wrench />} Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
