'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Loader2, MessageSquare, Plus, Search, Send, Siren } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { cn, formatCurrency, formatDateTime, formatRelativeTime } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useCan } from '@/hooks/use-can';
import { useBranches } from '@/hooks/use-branches';
import { toast } from '@/hooks/use-toast';
import { useUiStore } from '@/stores/ui.store';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Person = { firstName: string; lastName: string };
type Incident = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  type: string;
  severity: string;
  status: string;
  occurredAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  resolutionCost: number | string | null;
  assignedToId: string | null;
  branch?: { name: string };
  reportedBy?: Person;
  assignedTo?: Person | null;
  _count?: { comments: number };
};
type IncidentDetail = Incident & { comments: { id: string; content: string; author: string; createdAt: string }[] };
type UserOption = { id: string; firstName: string; lastName: string };

const STATUS: Record<string, { label: string; tone: 'destructive' | 'warning' | 'success' | 'secondary' }> = {
  open: { label: 'Abierta', tone: 'destructive' },
  in_progress: { label: 'En progreso', tone: 'warning' },
  resolved: { label: 'Resuelta', tone: 'success' },
  closed: { label: 'Cerrada', tone: 'secondary' },
};

const SEVERITY: Record<string, { label: string; dot: string }> = {
  low: { label: 'Baja', dot: 'bg-info' },
  medium: { label: 'Media', dot: 'bg-warning' },
  high: { label: 'Alta', dot: 'bg-orange-500' },
  critical: { label: 'Crítica', dot: 'bg-destructive' },
};

const TYPES: Record<string, string> = {
  theft: 'Robo',
  damage: 'Daño',
  accident: 'Accidente',
  complaint: 'Queja de cliente',
  equipment_failure: 'Falla de equipo',
  security: 'Seguridad',
  other: 'Otro',
};

const fullName = (p?: Person | null) => (p ? `${p.firstName} ${p.lastName}` : null);
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const schema = z.object({
  title: z.string().trim().min(3, 'Mínimo 3 caracteres').max(500),
  description: z.string().trim().min(5, 'Describe lo ocurrido'),
  type: z.string(),
  severity: z.string(),
  branchId: z.string().uuid('Selecciona la sede'),
  occurredAt: z.string().min(1, 'Obligatorio'),
  assignedToId: z.string().optional(),
});
type IncidentForm = z.infer<typeof schema>;

function useUserOptions(enabled: boolean) {
  return useQuery<UserOption[]>({
    queryKey: ['users', 'options'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => (await apiClient.get('/users', { params: { limit: 100 } })).data.data.data ?? [],
  });
}

function IncidentDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const canUpdate = useCan('incidents:update');
  const canAssign = useCan('incidents:assign');
  const { data: users = [] } = useUserOptions(!!id && canAssign);
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState('');
  const [cost, setCost] = useState('');

  const { data: inc, isLoading } = useQuery<IncidentDetail>({
    queryKey: ['incidents', 'detail', id],
    enabled: !!id,
    queryFn: async () => (await apiClient.get(`/incidents/${id}`)).data.data,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['incidents'] });
  };

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiClient.patch(`/incidents/${id}`, body),
    onSuccess: () => {
      toast({ title: 'Incidencia actualizada' });
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo actualizar', description: getErrorMessage(err) }),
  });

  const addComment = useMutation({
    mutationFn: () => apiClient.post(`/incidents/${id}/comments`, { content: comment.trim() }),
    onSuccess: () => {
      setComment('');
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo comentar', description: getErrorMessage(err) }),
  });

  const st = inc ? STATUS[inc.status] : undefined;
  const sev = inc ? SEVERITY[inc.severity] : undefined;
  const isOpen = inc && (inc.status === 'open' || inc.status === 'in_progress');

  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => {
        if (!o) {
          setResolution('');
          setCost('');
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {isLoading || !inc ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{inc.ticketNumber}</span>
                {st && <Badge variant={st.tone}>{st.label}</Badge>}
                {sev && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 rounded-full', sev.dot)} /> Severidad {sev.label.toLowerCase()}
                  </span>
                )}
                <span>· {TYPES[inc.type] ?? inc.type}</span>
              </div>
              <DialogTitle className="text-xl">{inc.title}</DialogTitle>
              <DialogDescription>
                {inc.branch?.name} · ocurrió el {formatDateTime(inc.occurredAt)} · reportó {fullName(inc.reportedBy)}
              </DialogDescription>
            </DialogHeader>

            <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm">{inc.description}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Responsable</Label>
                {canAssign ? (
                  <Select
                    value={inc.assignedToId ?? '__none__'}
                    onValueChange={(v) => v !== '__none__' && update.mutate({ assignedToId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" disabled>
                        Sin asignar
                      </SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{fullName(inc.assignedTo) ?? 'Sin asignar'}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                {canUpdate ? (
                  <Select value={inc.status} onValueChange={(v) => update.mutate({ status: v })}>
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
                ) : (
                  <p className="text-sm">{st?.label}</p>
                )}
              </div>
            </div>

            {inc.resolution ? (
              <div className="rounded-xl border border-success/40 bg-success/5 p-4 text-sm">
                <p className="mb-1 flex items-center gap-2 font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Resolución
                  {inc.resolvedAt && <span className="font-normal text-muted-foreground">· {formatDateTime(inc.resolvedAt)}</span>}
                </p>
                <p className="whitespace-pre-wrap">{inc.resolution}</p>
                {Number(inc.resolutionCost) > 0 && (
                  <p className="mt-1 text-muted-foreground">Costo: {formatCurrency(Number(inc.resolutionCost))}</p>
                )}
              </div>
            ) : (
              isOpen &&
              canUpdate && (
                <form
                  className="space-y-3 rounded-xl border p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!resolution.trim()) return;
                    update.mutate({
                      status: 'resolved',
                      resolution: resolution.trim(),
                      ...(cost ? { resolutionCost: Number(cost) } : {}),
                    });
                  }}
                >
                  <p className="text-sm font-semibold">Resolver incidencia</p>
                  <textarea
                    rows={2}
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="¿Cómo se solucionó?"
                    className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Costo (opcional)" className="sm:w-48" />
                    <Button type="submit" disabled={!resolution.trim() || update.isPending} className="sm:ml-auto">
                      {update.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Marcar como resuelta
                    </Button>
                  </div>
                </form>
              )
            )}

            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4 text-muted-foreground" /> Seguimiento ({inc.comments.length})
              </p>
              {inc.comments.length > 0 && (
                <ul className="space-y-2">
                  {inc.comments.map((c) => (
                    <li key={c.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <p className="mb-0.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{c.author}</span> · {formatRelativeTime(c.createdAt)}
                      </p>
                      <p className="whitespace-pre-wrap">{c.content}</p>
                    </li>
                  ))}
                </ul>
              )}
              {canUpdate && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (comment.trim()) addComment.mutate();
                  }}
                >
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Agregar un comentario de seguimiento" />
                  <Button type="submit" size="icon" disabled={!comment.trim() || addComment.isPending} aria-label="Enviar comentario">
                    {addComment.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  </Button>
                </form>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function IncidentsPage() {
  const qc = useQueryClient();
  const canCreate = useCan('incidents:create');
  const canAssign = useCan('incidents:assign');
  const activeBranch = useUiStore((s) => s.branchId);
  const { data: branches = [] } = useBranches();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [severity, setSeverity] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const debounced = useDebounce(search);
  const { data: users = [] } = useUserOptions(open && canAssign);

  const params = {
    page,
    limit: 20,
    search: debounced.trim() || undefined,
    status: status === 'all' ? undefined : status === 'active' ? 'open,in_progress' : status,
    severity: severity === 'all' ? undefined : severity,
    branchId: activeBranch || undefined,
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Paginated<Incident>>({
    queryKey: ['incidents', params],
    queryFn: async () => (await apiClient.get('/incidents', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  const form = useForm<IncidentForm>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;

  const create = useMutation({
    mutationFn: (v: IncidentForm) =>
      apiClient.post('/incidents', {
        ...v,
        assignedToId: v.assignedToId || undefined,
        occurredAt: new Date(v.occurredAt).toISOString(),
      }),
    onSuccess: () => {
      toast({ title: 'Incidencia reportada' });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo reportar', description: getErrorMessage(err) }),
  });

  const openForm = () => {
    form.reset({
      title: '',
      description: '',
      type: 'other',
      severity: 'medium',
      branchId: activeBranch || branches[0]?.id || '',
      occurredAt: nowLocal(),
      assignedToId: '',
    });
    setOpen(true);
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const filtered = !!(params.search || params.severity || status !== 'all');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incidencias"
        description="Robos, daños, fallas de equipos y quejas: repórtalas, asígnalas y haz seguimiento hasta resolverlas"
        icon={Siren}
        actions={
          canCreate && (
            <Button onClick={openForm} disabled={branches.length === 0}>
              <Plus /> Reportar incidencia
            </Button>
          )
        }
      />

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
              placeholder="Buscar por título, ticket o descripción"
              className="pl-9"
            />
            {isFetching && !isLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="lg:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(STATUS).map(([v, s]) => (
                <SelectItem key={v} value={v}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(1); }}>
            <SelectTrigger className="lg:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda severidad</SelectItem>
              {Object.entries(SEVERITY).map(([v, s]) => (
                <SelectItem key={v} value={v}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Siren}
            title={filtered ? 'No hay incidencias con estos filtros' : 'Sin incidencias registradas'}
            description={status === 'active' ? 'No hay incidencias pendientes. ¡Todo en orden!' : undefined}
          />
        ) : (
          <>
            <ul className={cn('divide-y', isFetching && 'opacity-70 transition-opacity')}>
              {rows.map((i) => {
                const st = STATUS[i.status] ?? { label: i.status, tone: 'secondary' as const };
                const sev = SEVERITY[i.severity];
                return (
                  <li key={i.id}>
                    <button
                      onClick={() => setViewId(i.id)}
                      className="flex w-full items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', sev?.dot ?? 'bg-muted-foreground')} title={sev?.label} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">{i.title}</p>
                          <Badge variant={st.tone}>{st.label}</Badge>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{i.description}</p>
                        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="font-mono">{i.ticketNumber}</span>
                          <span>{TYPES[i.type] ?? i.type}</span>
                          {i.branch && <span>{i.branch.name}</span>}
                          <span>Responsable: {fullName(i.assignedTo) ?? 'sin asignar'}</span>
                          {(i._count?.comments ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" /> {i._count?.comments}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{formatRelativeTime(i.occurredAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {meta && (
              <div className="border-t px-4 pb-3">
                <Paginator page={meta.page} totalPages={meta.totalPages} total={meta.total} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <IncidentDetailDialog id={viewId} onClose={() => setViewId(null)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reportar incidencia</DialogTitle>
            <DialogDescription>Se genera un número de ticket para hacerle seguimiento.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="i-title">Título *</Label>
              <Input id="i-title" autoFocus {...form.register('title')} placeholder="Ej. Se dañó la nevera de bebidas" />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-desc">¿Qué ocurrió? *</Label>
              <textarea
                id="i-desc"
                rows={3}
                {...form.register('description')}
                className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.watch('type')} onValueChange={(v) => form.setValue('type', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPES).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severidad</Label>
                <Select value={form.watch('severity')} onValueChange={(v) => form.setValue('severity', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEVERITY).map(([v, s]) => (
                      <SelectItem key={v} value={v}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label htmlFor="i-when">Fecha y hora *</Label>
                <Input id="i-when" type="datetime-local" max={nowLocal()} {...form.register('occurredAt')} />
              </div>
              {canAssign && users.length > 0 && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Responsable</Label>
                  <Select value={form.watch('assignedToId') || '__none__'} onValueChange={(v) => form.setValue('assignedToId', v === '__none__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin asignar</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
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
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" />}
                Reportar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
