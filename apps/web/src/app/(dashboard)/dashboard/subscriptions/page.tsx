'use client';

import { confirm } from '@/components/common/confirm-dialog';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, CreditCard, AlertCircle, TrendingUp, Repeat } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type Subscription = {
  id: string;
  name: string;
  providerName: string;
  billingCycle: 'monthly' | 'quarterly' | 'annual' | 'biennial';
  monthlyCost?: number;
  annualCost?: number;
  currency?: string;
  category?: string;
  status: 'active' | 'cancelled' | 'suspended' | 'trial';
  renewalDate: string;
  startDate: string;
  notes?: string;
  reminderDays?: number[];
};

type SubStats = {
  totalMonthly: number;
  totalAnnual: number;
  totalActive: number;
  upcomingRenewals: Subscription[];
};

type CreateForm = {
  name: string;
  providerName: string;
  billingCycle: string;
  monthlyCost: string;
  annualCost: string;
  currency: string;
  category: string;
  startDate: string;
  renewalDate: string;
  notes: string;
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'secondary',
  trial: 'default',
  cancelled: 'destructive',
  suspended: 'outline',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  trial: 'Prueba',
  cancelled: 'Cancelada',
  suspended: 'Suspendida',
};

const CYCLE_LABEL: Record<string, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  annual: 'Anual',
  biennial: 'Bienal',
};

const EMPTY_FORM: CreateForm = {
  name: '',
  providerName: '',
  billingCycle: 'monthly',
  monthlyCost: '',
  annualCost: '',
  currency: 'COP',
  category: '',
  startDate: new Date().toISOString().slice(0, 10),
  renewalDate: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
  notes: '',
};

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400_000);
}

export default function SubscriptionsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [error, setError] = useState('');

  const { data: stats, isLoading: statsLoading } = useQuery<SubStats>({
    queryKey: ['sub-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/subscriptions/stats');
      return data.data ?? data;
    },
  });

  const { data: subsData, isLoading } = useQuery<{ items: Subscription[]; total: number }>({
    queryKey: ['subscriptions', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const { data } = await apiClient.get('/subscriptions', { params });
      // La API responde { data: [...], meta: { total } }
      const page = data.data;
      return { items: Array.isArray(page?.data) ? page.data : [], total: page?.meta?.total ?? 0 };
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: object) => {
      const { data } = await apiClient.post('/subscriptions', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['sub-stats'] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setError('');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Error al crear suscripción'));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/subscriptions/${id}`, { status: 'cancelled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['sub-stats'] });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      providerName: form.providerName.trim(),
      billingCycle: form.billingCycle,
      startDate: form.startDate,
      renewalDate: form.renewalDate,
    };
    if (form.monthlyCost) body.monthlyCost = Number(form.monthlyCost);
    if (form.annualCost) body.annualCost = Number(form.annualCost);
    if (form.currency) body.currency = form.currency;
    if (form.category.trim()) body.category = form.category.trim();
    if (form.notes.trim()) body.notes = form.notes.trim();
    createMutation.mutate(body);
  }

  const subs = subsData?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suscripciones"
        description="Servicios y pagos recurrentes de la empresa con alertas de renovación"
        icon={Repeat}
        actions={
          <Button onClick={() => { setShowCreate(true); setError(''); }}>
            <Plus /> Nueva suscripción
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {statsLoading ? (
          [1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <CreditCard className="h-4 w-4" /> Costo mensual
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats?.totalMonthly ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Proyección anual: {formatCurrency(stats?.totalAnnual ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" /> Activas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalActive ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">suscripciones vigentes</p>
              </CardContent>
            </Card>
            <Card className={stats?.upcomingRenewals && stats.upcomingRenewals.length > 0 ? 'border-warning/50' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-warning" /> Próximas renovaciones
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.upcomingRenewals?.length ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">en los próximos 30 días</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Costo anual total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats?.totalAnnual ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">proyección completa</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Upcoming renewals alert */}
      {stats?.upcomingRenewals && stats.upcomingRenewals.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-warning">
              <AlertCircle className="h-4 w-4" /> Renovaciones próximas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {stats.upcomingRenewals.map((s) => {
                const days = daysUntil(s.renewalDate);
                return (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-warning font-medium">{s.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `en ${days} días`}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter + list */}
      <div className="flex gap-2">
        {['active', 'trial', 'suspended', 'cancelled', ''].map((s) => (
          <Button
            key={s || 'all'}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s === '' ? 'Todas' : STATUS_LABEL[s]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : subs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <CreditCard className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No hay suscripciones registradas</p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Agregar suscripción
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {subs.map((sub) => {
            const days = daysUntil(sub.renewalDate);
            const renewalSoon = days >= 0 && days <= 30;
            return (
              <Card key={sub.id} className={renewalSoon && sub.status === 'active' ? 'border-warning/50' : ''}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant={STATUS_VARIANT[sub.status] ?? 'outline'}>
                          {STATUS_LABEL[sub.status] ?? sub.status}
                        </Badge>
                        <Badge variant="outline">{CYCLE_LABEL[sub.billingCycle]}</Badge>
                        {sub.category && <span className="text-xs text-muted-foreground">{sub.category}</span>}
                      </div>
                      <p className="font-semibold">{sub.name}</p>
                      <p className="text-sm text-muted-foreground">{sub.providerName}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                        {sub.monthlyCost && <span>Mensual: {formatCurrency(Number(sub.monthlyCost))} {sub.currency ?? ''}</span>}
                        {sub.annualCost && <span>Anual: {formatCurrency(Number(sub.annualCost))} {sub.currency ?? ''}</span>}
                        <span className={renewalSoon && sub.status === 'active' ? 'text-warning font-medium' : ''}>
                          Renovación: {new Date(sub.renewalDate).toLocaleDateString('es-CO')}
                          {renewalSoon ? ` (${days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`})` : ''}
                        </span>
                      </div>
                      {sub.notes && <p className="text-xs text-muted-foreground mt-1">{sub.notes}</p>}
                    </div>
                    {sub.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive shrink-0"
                        onClick={async () => {
                          if (await confirm({ title: `¿Cancelar la suscripción "${sub.name}"?`, description: 'Esta acción no se puede deshacer.', destructive: true, confirmText: 'Confirmar' })) {
                            cancelMutation.mutate(sub.id);
                          }
                        }}
                        disabled={cancelMutation.isPending}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg">Nueva Suscripción</CardTitle>
                <CardDescription>Servicio o herramienta de pago recurrente</CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowCreate(false); setError(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Nombre *</label>
                    <Input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Adobe CC, AWS..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Proveedor *</label>
                    <Input required value={form.providerName} onChange={e => setForm(f => ({ ...f, providerName: e.target.value }))} placeholder="Ej: Adobe Inc." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Ciclo de pago *</label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                      value={form.billingCycle}
                      onChange={e => setForm(f => ({ ...f, billingCycle: e.target.value }))}
                    >
                      {Object.entries(CYCLE_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Categoría</label>
                    <Input placeholder="Ej: Software, Cloud..." value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Costo mensual</label>
                    <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.monthlyCost} onChange={e => setForm(f => ({ ...f, monthlyCost: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Costo anual</label>
                    <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.annualCost} onChange={e => setForm(f => ({ ...f, annualCost: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Moneda</label>
                    <Input placeholder="COP" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Fecha inicio *</label>
                    <Input type="date" required value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Fecha renovación *</label>
                    <Input type="date" required value={form.renewalDate} onChange={e => setForm(f => ({ ...f, renewalDate: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Notas</label>
                  <textarea
                    className="w-full min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Detalles adicionales..."
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={createMutation.isPending} className="flex-1">
                    {createMutation.isPending ? 'Guardando...' : 'Crear Suscripción'}
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
