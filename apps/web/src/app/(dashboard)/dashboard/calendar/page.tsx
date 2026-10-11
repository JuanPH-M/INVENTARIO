'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useCan } from '@/hooks/use-can';
import { useBranches } from '@/hooks/use-branches';
import { toast } from '@/hooks/use-toast';
import { confirm } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  color: string | null;
  branchId: string | null;
  branch?: { name: string } | null;
};

const TYPES: Record<string, { label: string; color: string }> = {
  meeting: { label: 'Reunión', color: '#6366f1' },
  inventory_count: { label: 'Conteo de inventario', color: '#f59e0b' },
  audit: { label: 'Auditoría', color: '#8b5cf6' },
  maintenance: { label: 'Mantenimiento', color: '#ef4444' },
  renewal: { label: 'Renovación / vencimiento', color: '#10b981' },
  training: { label: 'Capacitación', color: '#3b82f6' },
  task: { label: 'Tarea', color: '#14b8a6' },
  holiday: { label: 'Festivo / cierre', color: '#f97316' },
  other: { label: 'Otro', color: '#64748b' },
};

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const pad = (n: number) => String(n).padStart(2, '0');
/** Fecha en hora local con el formato de <input type="datetime-local"> (no UTC). */
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
const time = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const colorOf = (e: CalendarEvent) => e.color || TYPES[e.type]?.color || '#64748b';

type FormState = {
  title: string;
  type: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string;
  description: string;
  branchId: string;
};

function blankForm(day: Date): FormState {
  const start = new Date(day);
  const now = new Date();
  if (sameDay(start, now)) start.setHours(now.getHours() + 1, 0, 0, 0);
  else start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { title: '', type: 'task', startAt: toLocalInput(start), endAt: toLocalInput(end), allDay: false, location: '', description: '', branchId: '' };
}

function EventChip({ e, onClick }: { e: CalendarEvent; onClick: () => void }) {
  return (
    <button
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      className="flex w-full items-center gap-1 truncate rounded px-1 text-left text-[11px] leading-5 text-white transition-opacity hover:opacity-85"
      style={{ backgroundColor: colorOf(e) }}
      title={e.title}
    >
      {!e.allDay && <span className="shrink-0 opacity-80">{time(e.startAt)}</span>}
      <span className="truncate">{e.title}</span>
    </button>
  );
}

export default function CalendarPage() {
  const qc = useQueryClient();
  const canCreate = useCan('calendar:create');
  const canUpdate = useCan('calendar:update');
  const canDelete = useCan('calendar:delete');
  const { data: branches = [] } = useBranches();

  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState>(() => blankForm(today));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // Cuadrícula de 6 semanas empezando en lunes
  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [year, month]);

  const from = days[0]!;
  const to = new Date(days[41]!.getFullYear(), days[41]!.getMonth(), days[41]!.getDate(), 23, 59, 59);

  const { data: events = [], isLoading, isError, error, refetch } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar', 'events', year, month],
    queryFn: async () =>
      (await apiClient.get('/calendar/events', { params: { from: from.toISOString(), to: to.toISOString() } })).data.data ?? [],
    placeholderData: (prev) => prev,
  });

  const { data: upcoming = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar', 'upcoming'],
    queryFn: async () => (await apiClient.get('/calendar/events/upcoming')).data.data ?? [],
  });

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = dayKey(new Date(e.startAt));
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return map;
  }, [events]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['calendar'] });

  const save = useMutation({
    mutationFn: () => {
      const start = new Date(form.startAt);
      let end = new Date(form.endAt);
      if (form.allDay) {
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setHours(23, 59, 59, 0);
      }
      const body = {
        title: form.title.trim(),
        type: form.type,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        allDay: form.allDay,
        location: form.location.trim() || undefined,
        description: form.description.trim() || undefined,
        branchId: form.branchId || undefined,
      };
      return editing ? apiClient.patch(`/calendar/events/${editing.id}`, body) : apiClient.post('/calendar/events', body);
    },
    onSuccess: () => {
      toast({ title: editing ? 'Evento actualizado' : 'Evento creado' });
      setOpen(false);
      invalidate();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/calendar/events/${id}`),
    onSuccess: () => {
      toast({ title: 'Evento eliminado' });
      setOpen(false);
      invalidate();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo eliminar', description: getErrorMessage(err) }),
  });

  const openNew = (day: Date) => {
    if (!canCreate) return;
    setEditing(null);
    setForm(blankForm(day));
    setOpen(true);
  };

  const openEdit = (e: CalendarEvent) => {
    setEditing(e);
    setForm({
      title: e.title,
      type: e.type,
      startAt: toLocalInput(new Date(e.startAt)),
      endAt: toLocalInput(new Date(e.endAt)),
      allDay: e.allDay,
      location: e.location ?? '',
      description: e.description ?? '',
      branchId: e.branchId ?? '',
    });
    setOpen(true);
  };

  const move = (delta: number) => setCursor(new Date(year, month + delta, 1));
  const selectedEvents = byDay.get(dayKey(selected)) ?? [];
  const invalidRange = !form.allDay && new Date(form.endAt) <= new Date(form.startAt);
  const readOnly = editing ? !canUpdate : !canCreate;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario"
        description="Conteos de inventario, mantenimientos, reuniones y vencimientos de todas las sedes"
        icon={CalendarDays}
        actions={
          canCreate && (
            <Button onClick={() => openNew(selected)}>
              <Plus /> Nuevo evento
            </Button>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-lg font-semibold">
              {MONTHS[month]} <span className="text-muted-foreground">{year}</span>
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
                  setSelected(today);
                }}
              >
                Hoy
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(-1)} aria-label="Mes anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(1)} aria-label="Mes siguiente">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : (
            <>
              <div className="grid grid-cols-7 border-b bg-muted/40">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((d, i) => {
                  const inMonth = d.getMonth() === month;
                  const isToday = sameDay(d, today);
                  const isSel = sameDay(d, selected);
                  const list = byDay.get(dayKey(d)) ?? [];
                  return (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(d)}
                      onDoubleClick={() => openNew(d)}
                      onKeyDown={(e) => e.key === 'Enter' && setSelected(d)}
                      className={cn(
                        'min-h-[64px] cursor-pointer border-b border-r p-1 transition-colors sm:min-h-[104px]',
                        (i + 1) % 7 === 0 && 'border-r-0',
                        !inMonth && 'bg-muted/30 text-muted-foreground',
                        isSel ? 'bg-primary/5 ring-2 ring-inset ring-primary/60' : 'hover:bg-muted/40',
                      )}
                    >
                      <span
                        className={cn(
                          'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                          isToday && 'bg-primary text-primary-foreground',
                        )}
                      >
                        {d.getDate()}
                      </span>
                      {isLoading ? (
                        i % 5 === 0 && <Skeleton className="h-4 w-full" />
                      ) : (
                        <>
                          <div className="hidden space-y-0.5 sm:block">
                            {list.slice(0, 3).map((e) => (
                              <EventChip key={e.id} e={e} onClick={() => openEdit(e)} />
                            ))}
                            {list.length > 3 && <p className="px-1 text-[11px] text-muted-foreground">+{list.length - 3} más</p>}
                          </div>
                          {list.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 sm:hidden">
                              {list.slice(0, 4).map((e) => (
                                <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colorOf(e) }} />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold capitalize">
                {selected.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              {canCreate && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openNew(selected)} aria-label="Agregar evento este día">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos este día.</p>
            ) : (
              <ul className="space-y-2">
                {selectedEvents.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => openEdit(e)} className="flex w-full gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40">
                      <span className="mt-1 h-full w-1 shrink-0 self-stretch rounded-full" style={{ backgroundColor: colorOf(e) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{e.title}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> {e.allDay ? 'Todo el día' : `${time(e.startAt)} – ${time(e.endAt)}`}
                        </span>
                        {(e.location || e.branch) && (
                          <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {[e.branch?.name, e.location].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <p className="mb-3 font-semibold">Próximos 30 días</p>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay eventos próximos.</p>
            ) : (
              <ul className="space-y-2.5">
                {upcoming.slice(0, 8).map((e) => {
                  const d = new Date(e.startAt);
                  return (
                    <li key={e.id}>
                      <button
                        className="flex w-full items-center gap-3 text-left"
                        onClick={() => {
                          setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                          setSelected(d);
                        }}
                      >
                        <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-muted py-1">
                          <span className="text-[10px] uppercase text-muted-foreground">{MONTHS[d.getMonth()]!.slice(0, 3)}</span>
                          <span className="text-sm font-semibold leading-none">{d.getDate()}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{e.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {TYPES[e.type]?.label ?? e.type}
                            {!e.allDay && ` · ${time(e.startAt)}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-1">
            {Object.entries(TYPES).map(([k, t]) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} /> {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? (readOnly ? 'Evento' : 'Editar evento') : 'Nuevo evento'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (form.title.trim() && !invalidRange) save.mutate();
            }}
          >
            <fieldset disabled={readOnly} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ev-title">Título *</Label>
                <Input id="ev-title" autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej. Conteo general bodega" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))} disabled={readOnly}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPES).map(([v, t]) => (
                        <SelectItem key={v} value={v}>
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} /> {t.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {branches.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Sede</Label>
                    <Select value={form.branchId || '__all__'} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === '__all__' ? '' : v }))} disabled={readOnly}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Toda la empresa</SelectItem>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.allDay} onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                Todo el día
              </label>

              {form.allDay ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ev-day">Día</Label>
                  <Input
                    id="ev-day"
                    type="date"
                    value={form.startAt.slice(0, 10)}
                    onChange={(e) => setForm((f) => ({ ...f, startAt: `${e.target.value}T00:00`, endAt: `${e.target.value}T23:59` }))}
                  />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-start">Inicio</Label>
                    <Input
                      id="ev-start"
                      type="datetime-local"
                      value={form.startAt}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((f) => {
                          // Mantiene la duración al mover el inicio
                          const dur = new Date(f.endAt).getTime() - new Date(f.startAt).getTime();
                          const end = new Date(new Date(v).getTime() + (dur > 0 ? dur : 3600_000));
                          return { ...f, startAt: v, endAt: toLocalInput(end) };
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-end">Fin</Label>
                    <Input id="ev-end" type="datetime-local" value={form.endAt} min={form.startAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))} />
                  </div>
                  {invalidRange && <p className="text-xs text-destructive sm:col-span-2">El fin debe ser posterior al inicio.</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="ev-loc">Lugar</Label>
                <Input id="ev-loc" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-desc">Notas</Label>
                <textarea
                  id="ev-desc"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              </div>
            </fieldset>

            <DialogFooter className="gap-2 sm:justify-between">
              {editing && canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={remove.isPending}
                  onClick={async () => {
                    const ok = await confirm({ title: `¿Eliminar "${editing.title}"?`, destructive: true, confirmText: 'Eliminar' });
                    if (ok) remove.mutate(editing.id);
                  }}
                >
                  <Trash2 /> Eliminar
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {readOnly ? 'Cerrar' : 'Cancelar'}
                </Button>
                {!readOnly && (
                  <Button type="submit" disabled={!form.title.trim() || invalidRange || save.isPending}>
                    {save.isPending ? <Loader2 className="animate-spin" /> : editing ? <Pencil /> : <Plus />}
                    {editing ? 'Guardar' : 'Crear'}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
