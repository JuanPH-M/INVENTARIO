'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Eye, Loader2, Mail, Pencil, Phone, Plus, Search, Send, Trash2, User, Users } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { cn, formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { SALE_STATUS } from '@/lib/labels';
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

type Client = {
  id: string;
  type: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  idType: string;
  idNumber: string;
  creditLimit: number | string;
  totalSales: number | string;
  lastActivityAt: string | null;
  createdAt: string;
};

type ClientDetail = Client & { clientNotes: { id: string; content: string; createdAt: string }[] };
type History = { sales: { id: string; saleNumber: string; total: number | string; status: string; createdAt: string }[]; totalSales: number };

const STATUS: Record<string, { label: string; tone: 'success' | 'secondary' | 'destructive' }> = {
  active: { label: 'Activo', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'secondary' },
  blacklisted: { label: 'Bloqueado', tone: 'destructive' },
};

const ID_TYPES = ['CC', 'NIT', 'CE', 'Pasaporte', 'RUT', 'TI', 'Otro'];

const schema = z
  .object({
    type: z.enum(['individual', 'business']),
    idType: z.string().min(1, 'Obligatorio'),
    idNumber: z.string().trim().min(3, 'Mínimo 3 caracteres'),
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    businessName: z.string().trim().optional(),
    email: z.string().trim().email('Correo inválido').optional().or(z.literal('')),
    phone: z.string().trim().optional(),
    creditLimit: z.coerce.number().min(0, 'No puede ser negativo'),
    status: z.string().optional(),
  })
  .refine((v) => (v.type === 'business' ? !!v.businessName : !!v.firstName), {
    message: 'Escribe el nombre',
    path: ['firstName'],
  });

type ClientForm = z.infer<typeof schema>;

const EMPTY: ClientForm = {
  type: 'individual',
  idType: 'CC',
  idNumber: '',
  firstName: '',
  lastName: '',
  businessName: '',
  email: '',
  phone: '',
  creditLimit: 0,
  status: 'active',
};

const clientName = (c: Pick<Client, 'businessName' | 'firstName' | 'lastName'>) =>
  c.businessName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Sin nombre';

function ClientDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const canNote = useCan('clients:add_notes');
  const canHistory = useCan('clients:view_history');
  const [note, setNote] = useState('');

  const { data: client, isLoading } = useQuery<ClientDetail>({
    queryKey: ['clients', 'detail', id],
    enabled: !!id,
    queryFn: async () => (await apiClient.get(`/clients/${id}`)).data.data,
  });

  const { data: history } = useQuery<History>({
    queryKey: ['clients', 'history', id],
    enabled: !!id && canHistory,
    queryFn: async () => (await apiClient.get(`/clients/${id}/history`)).data.data,
  });

  const addNote = useMutation({
    mutationFn: () => apiClient.post(`/clients/${id}/notes`, { content: note.trim() }),
    onSuccess: () => {
      setNote('');
      void qc.invalidateQueries({ queryKey: ['clients', 'detail', id] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo guardar la nota', description: getErrorMessage(err) }),
  });

  const st = client ? STATUS[client.status] : undefined;

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {isLoading || !client ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {client.type === 'business' ? <Building2 className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-primary" />}
                {clientName(client)}
                {st && <Badge variant={st.tone}>{st.label}</Badge>}
              </DialogTitle>
              <DialogDescription>
                {client.idType} {client.idNumber} · Cliente desde {formatDate(client.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Total comprado</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(Number(client.totalSales))}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Compras registradas</p>
                <p className="text-lg font-semibold tabular-nums">{history?.totalSales ?? '—'}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Cupo de crédito</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(Number(client.creditLimit))}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              {client.email && (
                <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <Mail className="h-4 w-4" /> {client.email}
                </a>
              )}
              {client.phone && (
                <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <Phone className="h-4 w-4" /> {client.phone}
                </a>
              )}
            </div>

            {canHistory && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Últimas compras</p>
                {!history ? (
                  <Skeleton className="h-16 w-full" />
                ) : history.sales.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Este cliente aún no tiene compras.</p>
                ) : (
                  <ul className="divide-y rounded-xl border">
                    {history.sales.map((s) => {
                      const ss = SALE_STATUS[s.status];
                      return (
                        <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span className="font-mono text-xs">{s.saleNumber}</span>
                          <span className="flex-1 text-muted-foreground">{formatDate(s.createdAt)}</span>
                          {ss && <Badge variant={ss.tone}>{ss.label}</Badge>}
                          <span className="w-28 text-right font-medium tabular-nums">{formatCurrency(Number(s.total))}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-semibold">Notas</p>
              {canNote && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (note.trim()) addNote.mutate();
                  }}
                >
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Prefiere pagar por transferencia" />
                  <Button type="submit" size="icon" disabled={!note.trim() || addNote.isPending} aria-label="Agregar nota">
                    {addNote.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  </Button>
                </form>
              )}
              {client.clientNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin notas.</p>
              ) : (
                <ul className="space-y-2">
                  {client.clientNotes.map((n) => (
                    <li key={n.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      {n.content}
                      <span className="mt-0.5 block text-xs text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ClientsPage() {
  const qc = useQueryClient();
  const canCreate = useCan('clients:create');
  const canUpdate = useCan('clients:update');
  const canDelete = useCan('clients:delete');
  const canCredit = useCan('clients:manage_credit');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const debounced = useDebounce(search);

  const params = { page, limit: 20, search: debounced.trim() || undefined, status: status === 'all' ? undefined : status };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Paginated<Client>>({
    queryKey: ['clients', params],
    queryFn: async () => (await apiClient.get('/clients', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  const form = useForm<ClientForm>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { errors } = form.formState;
  const type = form.watch('type');

  const save = useMutation({
    mutationFn: async (v: ClientForm) => {
      const body = Object.fromEntries(
        Object.entries({ ...v, status: editing ? v.status : undefined }).filter(([, val]) => val !== '' && val !== undefined),
      );
      return editing ? apiClient.patch(`/clients/${editing.id}`, body) : apiClient.post('/clients', body);
    },
    onSuccess: () => {
      toast({ title: editing ? 'Cliente actualizado' : 'Cliente creado' });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/clients/${id}`),
    onSuccess: () => {
      toast({ title: 'Cliente eliminado' });
      void qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo eliminar', description: getErrorMessage(err) }),
  });

  const openForm = (c: Client | null) => {
    setEditing(c);
    form.reset(
      c
        ? {
            type: c.type === 'business' ? 'business' : 'individual',
            idType: c.idType,
            idNumber: c.idNumber,
            firstName: c.firstName ?? '',
            lastName: c.lastName ?? '',
            businessName: c.businessName ?? '',
            email: c.email ?? '',
            phone: c.phone ?? '',
            creditLimit: Number(c.creditLimit),
            status: c.status,
          }
        : EMPTY,
    );
    setOpen(true);
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const filtered = !!(params.search || params.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Base de clientes compartida entre todas las sedes, con historial de compras y notas"
        icon={Users}
        actions={
          canCreate && (
            <Button onClick={() => openForm(null)}>
              <Plus /> Nuevo cliente
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
              placeholder="Buscar por nombre, documento o correo"
              className="pl-9"
            />
            {isFetching && !isLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
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
            icon={Users}
            title={filtered ? 'Ningún cliente coincide' : 'Aún no hay clientes'}
            description={filtered ? 'Prueba con otra búsqueda.' : 'Registra clientes para asociarlos a ventas, dar crédito y ver su historial.'}
            action={
              !filtered && canCreate ? (
                <Button onClick={() => openForm(null)}>
                  <Plus /> Nuevo cliente
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Contacto</TableHead>
                  <TableHead className="text-right">Total comprado</TableHead>
                  <TableHead className="hidden lg:table-cell">Última actividad</TableHead>
                  <TableHead className="hidden sm:table-cell">Estado</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody className={cn(isFetching && !isLoading && 'opacity-70 transition-opacity')}>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : rows.map((c) => {
                      const st = STATUS[c.status] ?? { label: c.status, tone: 'secondary' as const };
                      return (
                        <TableRow key={c.id} className="cursor-pointer" onClick={() => setViewId(c.id)}>
                          <TableCell>
                            <p className="font-medium">{clientName(c)}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {c.idType} {c.idNumber}
                            </p>
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                            <p className="truncate">{c.email ?? '—'}</p>
                            <p>{c.phone ?? ''}</p>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatCurrency(Number(c.totalSales))}</TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                            {c.lastActivityAt ? formatRelativeTime(c.lastActivityAt) : 'Sin compras'}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={st.tone}>{st.label}</Badge>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewId(c.id)} aria-label="Ver detalle">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
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
                                      title: `¿Eliminar a ${clientName(c)}?`,
                                      description: 'Sus ventas anteriores se conservan en el historial.',
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

      <ClientDetailDialog id={viewId} onClose={() => setViewId(null)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              {(['individual', 'business'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => form.setValue('type', t)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium transition-colors',
                    type === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'individual' ? <User className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                  {t === 'individual' ? 'Persona' : 'Empresa'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label>Documento *</Label>
                <Select value={form.watch('idType')} onValueChange={(v) => form.setValue('idType', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="idNumber">Número *</Label>
                <Input id="idNumber" {...form.register('idNumber')} placeholder="1020304050" />
                {errors.idNumber && <p className="text-xs text-destructive">{errors.idNumber.message}</p>}
              </div>
            </div>

            {type === 'business' ? (
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Razón social *</Label>
                <Input id="businessName" {...form.register('businessName')} />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Nombres *</Label>
                  <Input id="firstName" {...form.register('firstName')} />
                  {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Apellidos</Label>
                  <Input id="lastName" {...form.register('lastName')} />
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" type="email" {...form.register('email')} placeholder="cliente@correo.com" />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" {...form.register('phone')} placeholder="+57 300 000 0000" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {canCredit && (
                <div className="space-y-1.5">
                  <Label htmlFor="creditLimit">Cupo de crédito</Label>
                  <Input id="creditLimit" type="number" min="0" step="any" {...form.register('creditLimit')} />
                  {errors.creditLimit && <p className="text-xs text-destructive">{errors.creditLimit.message}</p>}
                </div>
              )}
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />}
                {editing ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
