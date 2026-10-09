'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
type IncidentType = 'theft' | 'damage' | 'accident' | 'complaint' | 'equipment_failure' | 'security' | 'other';

type Incident = {
  id: string;
  title: string;
  description?: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurredAt: string;
  createdAt: string;
  branch?: { name: string };
  reportedBy?: { firstName: string; lastName: string };
  assignedTo?: { firstName: string; lastName: string };
  resolution?: string;
  resolutionCost?: number;
};

type CreateForm = {
  title: string;
  description: string;
  type: IncidentType;
  severity: IncidentSeverity;
  occurredAt: string;
  branchId: string;
  assignedToId: string;
};

type UpdateForm = {
  status: IncidentStatus;
  resolution: string;
  resolutionCost: string;
  assignedToId: string;
};

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Abierto',
  in_progress: 'En progreso',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const STATUS_VARIANT: Record<IncidentStatus, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  open: 'destructive',
  in_progress: 'default',
  resolved: 'secondary',
  closed: 'outline',
};

const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  low: 'text-blue-600',
  medium: 'text-yellow-600',
  high: 'text-orange-600',
  critical: 'text-red-600',
};

const TYPE_LABELS: Record<IncidentType, string> = {
  theft: 'Robo',
  damage: 'Daño',
  accident: 'Accidente',
  complaint: 'Queja',
  equipment_failure: 'Fallo de equipo',
  security: 'Seguridad',
  other: 'Otro',
};

const EMPTY_CREATE: CreateForm = {
  title: '',
  description: '',
  type: 'other',
  severity: 'low',
  occurredAt: new Date().toISOString().slice(0, 16),
  branchId: '',
  assignedToId: '',
};

const EMPTY_UPDATE: UpdateForm = {
  status: 'in_progress',
  resolution: '',
  resolutionCost: '',
  assignedToId: '',
};

export default function IncidentsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Incident | null>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [updateForm, setUpdateForm] = useState<UpdateForm>(EMPTY_UPDATE);
  const [error, setError] = useState('');

  const { data: incidents, isLoading } = useQuery<Incident[]>({
    queryKey: ['incidents', statusFilter, severityFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (severityFilter) params.severity = severityFilter;
      const { data } = await apiClient.get('/incidents', { params });
      return data.data?.items ?? data.data ?? [];
    },
  });

  const { data: branches } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['branches-simple'],
    queryFn: async () => {
      const { data } = await apiClient.get('/branches');
      return data.data?.items ?? data.data ?? [];
    },
  });

  const { data: users } = useQuery<{ id: string; firstName: string; lastName: string }[]>({
    queryKey: ['users-simple'],
    queryFn: async () => {
      const { data } = await apiClient.get('/users');
      return data.data?.items ?? data.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: object) => {
      const { data } = await apiClient.post('/incidents', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setShowCreate(false);
      setForm(EMPTY_CREATE);
      setError('');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Error al crear incidencia'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: object }) => {
      const { data } = await apiClient.patch(`/incidents/${id}`, body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setEditing(null);
      setError('');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Error al actualizar'));
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const body: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
      severity: form.severity,
      occurredAt: new Date(form.occurredAt).toISOString(),
    };
    if (form.description.trim()) body.description = form.description.trim();
    if (form.branchId) body.branchId = form.branchId;
    if (form.assignedToId) body.assignedToId = form.assignedToId;
    createMutation.mutate(body);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError('');
    const body: Record<string, unknown> = { status: updateForm.status };
    if (updateForm.resolution.trim()) body.resolution = updateForm.resolution.trim();
    if (updateForm.resolutionCost) body.resolutionCost = Number(updateForm.resolutionCost);
    if (updateForm.assignedToId) body.assignedToId = updateForm.assignedToId;
    updateMutation.mutate({ id: editing.id, body });
  }

  const filtered = (incidents ?? []).filter((i) =>
    !search || i.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Incidencias</h2>
          <p className="text-muted-foreground">Gestión de incidentes y eventos</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setError(''); }}>
          <Plus className="h-4 w-4 mr-2" /> Nueva Incidencia
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Buscar por título..."
          className="max-w-xs h-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-8 rounded-md border bg-background px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border bg-background px-3 text-sm"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="">Todas las severidades</option>
          {Object.entries(SEVERITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No hay incidencias registradas</p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Crear primera incidencia
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((incident) => (
            <Card key={incident.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant={STATUS_VARIANT[incident.status]}>
                        {STATUS_LABELS[incident.status]}
                      </Badge>
                      <span className={`text-xs font-semibold ${SEVERITY_COLOR[incident.severity]}`}>
                        {SEVERITY_LABELS[incident.severity]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {TYPE_LABELS[incident.type]}
                      </span>
                    </div>
                    <p className="font-semibold truncate">{incident.title}</p>
                    {incident.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{incident.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {incident.branch && <span>Sucursal: {incident.branch.name}</span>}
                      {incident.reportedBy && (
                        <span>Reportado por: {incident.reportedBy.firstName} {incident.reportedBy.lastName}</span>
                      )}
                      {incident.assignedTo && (
                        <span>Asignado: {incident.assignedTo.firstName} {incident.assignedTo.lastName}</span>
                      )}
                      <span>{new Date(incident.occurredAt).toLocaleDateString('es-CO')}</span>
                    </div>
                    {incident.resolution && (
                      <p className="text-xs mt-1 text-green-700 dark:text-green-400">
                        Resolución: {incident.resolution}
                      </p>
                    )}
                  </div>
                  {incident.status !== 'closed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(incident);
                        setUpdateForm({
                          status: incident.status === 'open' ? 'in_progress' : incident.status,
                          resolution: incident.resolution ?? '',
                          resolutionCost: incident.resolutionCost ? String(incident.resolutionCost) : '',
                          assignedToId: incident.assignedTo ? '' : '',
                        });
                        setError('');
                      }}
                    >
                      Actualizar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Nueva Incidencia</CardTitle>
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
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Descripción breve del incidente"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Descripción</label>
                  <textarea
                    className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Detalles adicionales..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Tipo *</label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as IncidentType }))}
                    >
                      {Object.entries(TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Severidad *</label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                      value={form.severity}
                      onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as IncidentSeverity }))}
                    >
                      {Object.entries(SEVERITY_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Fecha y hora del evento *</label>
                  <Input
                    type="datetime-local"
                    required
                    value={form.occurredAt}
                    onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
                  />
                </div>
                {branches && branches.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Sucursal</label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                      value={form.branchId}
                      onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                    >
                      <option value="">Sin sucursal específica</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {users && users.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Asignar a</label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                      value={form.assignedToId}
                      onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))}
                    >
                      <option value="">Sin asignar</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={createMutation.isPending} className="flex-1">
                    {createMutation.isPending ? 'Guardando...' : 'Crear Incidencia'}
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

      {/* Update modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Actualizar Incidencia</CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(null); setError(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdate} className="space-y-4">
                {error && <p className="text-sm text-destructive">{error}</p>}
                <p className="text-sm font-medium text-muted-foreground truncate">{editing.title}</p>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Nuevo estado</label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                    value={updateForm.status}
                    onChange={(e) => setUpdateForm((f) => ({ ...f, status: e.target.value as IncidentStatus }))}
                  >
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Resolución</label>
                  <textarea
                    className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    value={updateForm.resolution}
                    onChange={(e) => setUpdateForm((f) => ({ ...f, resolution: e.target.value }))}
                    placeholder="Describe cómo se resolvió..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Costo de resolución</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={updateForm.resolutionCost}
                    onChange={(e) => setUpdateForm((f) => ({ ...f, resolutionCost: e.target.value }))}
                  />
                </div>
                {users && users.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Reasignar a</label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                      value={updateForm.assignedToId}
                      onChange={(e) => setUpdateForm((f) => ({ ...f, assignedToId: e.target.value }))}
                    >
                      <option value="">Sin cambio</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={updateMutation.isPending} className="flex-1">
                    {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setEditing(null); setError(''); }}>
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
