'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  type: string;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  location?: string;
  color?: string;
  branch?: { name: string };
};

type CreateEventForm = {
  title: string;
  type: string;
  startAt: string;
  endAt: string;
  description: string;
  location: string;
  allDay: boolean;
  color: string;
};

const EVENT_TYPES = [
  { value: 'meeting', label: 'Reunión' },
  { value: 'inventory_count', label: 'Conteo de inventario' },
  { value: 'audit', label: 'Auditoría' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'renewal', label: 'Renovación' },
  { value: 'training', label: 'Capacitación' },
  { value: 'task', label: 'Tarea' },
  { value: 'holiday', label: 'Festivo' },
  { value: 'other', label: 'Otro' },
];

const TYPE_COLORS: Record<string, string> = {
  meeting: '#6366f1',
  inventory_count: '#f59e0b',
  audit: '#8b5cf6',
  maintenance: '#ef4444',
  renewal: '#10b981',
  training: '#3b82f6',
  task: '#14b8a6',
  holiday: '#f97316',
  other: '#6b7280',
};

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDateLocal(date: Date) {
  return date.toISOString().slice(0, 16);
}

const EMPTY_FORM: CreateEventForm = {
  title: '',
  type: 'task',
  startAt: formatDateLocal(new Date()),
  endAt: formatDateLocal(new Date(Date.now() + 3600_000)),
  description: '',
  location: '',
  allDay: false,
  color: '',
};

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateEventForm>(EMPTY_FORM);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [error, setError] = useState('');

  const from = new Date(year, month, 1).toISOString();
  const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', year, month],
    queryFn: async () => {
      const { data } = await apiClient.get('/calendar/events', { params: { from, to } });
      return data.data ?? [];
    },
  });

  const { data: upcoming = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-upcoming'],
    queryFn: async () => {
      const { data } = await apiClient.get('/calendar/events/upcoming');
      return data.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: object) => {
      const { data } = await apiClient.post('/calendar/events', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-upcoming'] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setError('');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Error al crear evento'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/calendar/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-upcoming'] });
    },
  });

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      allDay: form.allDay,
    };
    if (form.description.trim()) body.description = form.description.trim();
    if (form.location.trim()) body.location = form.location.trim();
    if (form.color) body.color = form.color;
    createMutation.mutate(body);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const todayDay = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : null;

  function eventsOnDay(day: number) {
    return events.filter((e) => {
      const d = new Date(e.startAt);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  }

  const selectedDayEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Calendario
          </h2>
          <p className="text-muted-foreground">Eventos, tareas y recordatorios del equipo</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setError(''); }}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo Evento
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Calendar grid */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{MONTHS[month]} {year}</CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : (
              <div>
                {/* Weekday headers */}
                <div className="grid grid-cols-7 mb-2">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                  ))}
                </div>
                {/* Day grid */}
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-muted/20 min-h-[70px]" />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dayEvents = eventsOnDay(day);
                    const isToday = todayDay === day;
                    const isSelected = selectedDay === day;
                    return (
                      <div
                        key={day}
                        className={`bg-background min-h-[70px] p-1 cursor-pointer hover:bg-accent/50 transition-colors ${isSelected ? 'ring-2 ring-inset ring-primary' : ''}`}
                        onClick={() => setSelectedDay(isSelected ? null : day)}
                      >
                        <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                          {day}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 2).map((ev) => (
                            <div
                              key={ev.id}
                              className="text-[10px] truncate rounded px-1 text-white leading-4"
                              style={{ backgroundColor: ev.color ?? TYPE_COLORS[ev.type] ?? '#6b7280' }}
                            >
                              {ev.title}
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 2} más</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected day events */}
            {selectedDay && selectedDayEvents.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">{selectedDay} de {MONTHS[month]}</p>
                {selectedDayEvents.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2 p-2 rounded-md border">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: ev.color ?? TYPE_COLORS[ev.type] ?? '#6b7280' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ev.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {ev.allDay ? 'Todo el día' : `${new Date(ev.startAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} – ${new Date(ev.endAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                      {ev.location && <p className="text-xs text-muted-foreground">{ev.location}</p>}
                    </div>
                    <button
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      onClick={() => deleteMutation.mutate(ev.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming events sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Próximos eventos (30 días)</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin eventos próximos</p>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((ev) => (
                    <div key={ev.id} className="flex items-start gap-2">
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: ev.color ?? TYPE_COLORS[ev.type] ?? '#6b7280' }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(ev.startAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                        </p>
                        <Badge variant="outline" className="text-[10px] mt-0.5">
                          {EVENT_TYPES.find(t => t.value === ev.type)?.label ?? ev.type}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tipos de evento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {EVENT_TYPES.map((t) => (
                  <div key={t.value} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[t.value] }} />
                    <span className="text-xs text-muted-foreground">{t.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Nuevo Evento</CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowCreate(false); setError(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Título *</label>
                  <Input
                    required
                    value={form.title}
                    onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Nombre del evento"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Tipo *</label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                      value={form.type}
                      onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                    >
                      {EVENT_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Color</label>
                    <Input
                      type="color"
                      className="h-9 w-full"
                      value={form.color || TYPE_COLORS[form.type] || '#6b7280'}
                      onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allDay"
                    checked={form.allDay}
                    onChange={(e) => setForm(f => ({ ...f, allDay: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="allDay" className="text-sm">Todo el día</label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Inicio *</label>
                    <Input
                      type={form.allDay ? 'date' : 'datetime-local'}
                      required
                      value={form.startAt.slice(0, form.allDay ? 10 : 16)}
                      onChange={(e) => setForm(f => ({ ...f, startAt: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Fin *</label>
                    <Input
                      type={form.allDay ? 'date' : 'datetime-local'}
                      required
                      value={form.endAt.slice(0, form.allDay ? 10 : 16)}
                      onChange={(e) => setForm(f => ({ ...f, endAt: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Descripción</label>
                  <textarea
                    className="w-full min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    value={form.description}
                    onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Detalles adicionales..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Lugar</label>
                  <Input
                    placeholder="Sala, dirección..."
                    value={form.location}
                    onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={createMutation.isPending} className="flex-1">
                    {createMutation.isPending ? 'Guardando...' : 'Crear Evento'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setShowCreate(false); setError(''); }}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
