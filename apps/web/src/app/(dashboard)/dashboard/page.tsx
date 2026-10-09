'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Boxes,
  CircleDollarSign,
  PackageSearch,
  Receipt,
  ScanBarcode,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn, formatCompact, formatCurrency, formatRelativeTime } from '@/lib/utils';
import { PAYMENT_LABELS, SALE_STATUS, label } from '@/lib/labels';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { useBranches } from '@/hooks/use-branches';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/common/stat-card';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';

const Charts = {
  Trend: dynamic(() => import('@/components/charts/business-charts').then((m) => m.RevenueTrendChart), {
    ssr: false,
    loading: () => <Skeleton className="h-[280px] w-full" />,
  }),
  Branches: dynamic(() => import('@/components/charts/business-charts').then((m) => m.BranchBarChart), {
    ssr: false,
    loading: () => <Skeleton className="h-[180px] w-full" />,
  }),
  Payments: dynamic(() => import('@/components/charts/business-charts').then((m) => m.PaymentMixChart), {
    ssr: false,
    loading: () => <Skeleton className="h-[170px] w-full" />,
  }),
};

type Overview = {
  period: { start: string; end: string; days: number };
  kpis: {
    revenue: number;
    revenueChange: number | null;
    salesCount: number;
    salesCountChange: number | null;
    averageTicket: number;
    averageTicketChange: number | null;
    grossProfit: number;
    grossProfitChange: number | null;
    grossMargin: number;
    taxCollected: number;
    purchasesTotal: number;
  };
  trend: Array<{ date: string; revenue: number; transactions: number }>;
  byBranch: Array<{ branchId: string; name: string; revenue: number; transactions: number }>;
  byPayment: Array<{ type: string; amount: number; count: number }>;
  topProducts: Array<{ productId: string; name: string; quantity: number; revenue: number }>;
  recentSales: Array<{
    id: string;
    saleNumber: string;
    total: number;
    status: string;
    createdAt: string;
    branch?: string;
    payment: string | null;
    customer: string;
  }>;
  inventory: { activeProducts: number; stockValue: number; stockRetailValue: number; lowStock: number; outOfStock: number };
};

type Forecast = {
  productId: string;
  productName: string;
  branchName: string;
  currentStock: number;
  predictedDaysUntilStockout: number | null;
  recommendedReorderQty: number;
  risk: 'critical' | 'high' | 'medium' | 'low';
};

const PERIODS = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function QuickActions() {
  const user = useAuthStore((s) => s.user);
  const can = (p: string) => user?.permissions.includes(p) ?? false;
  const actions = [
    { href: '/dashboard/pos', label: 'Nueva venta', icon: ScanBarcode, show: can('sales:create'), primary: true },
    { href: '/dashboard/products', label: 'Productos', icon: PackageSearch, show: can('products:read') },
    { href: '/dashboard/purchases', label: 'Compras', icon: Truck, show: can('purchases:read') },
    { href: '/dashboard/clients', label: 'Clientes', icon: Users, show: can('clients:read') },
  ].filter((a) => a.show);
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button key={a.href} asChild variant={a.primary ? 'default' : 'outline'} size="sm">
          <Link href={a.href}>
            <a.icon /> {a.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}

function StockRiskCard({ branchId }: { branchId: string }) {
  const canSee = useAuthStore((s) => s.user?.permissions.includes('ai:predictions') ?? false);
  const { data = [], isLoading } = useQuery<Forecast[]>({
    queryKey: ['ai', 'forecast', branchId],
    enabled: canSee,
    queryFn: async () => (await apiClient.get('/ai/predictions/stock', { params: { branchId: branchId || undefined } })).data.data,
  });
  if (!canSee) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Reposición sugerida
          </CardTitle>
          <CardDescription>Productos que se agotarán pronto según el ritmo de ventas</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/ai">
            Ver todo <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)
        ) : data.length === 0 ? (
          <EmptyState icon={Boxes} title="Inventario saludable" description="Ningún producto está en riesgo de agotarse." className="py-8" />
        ) : (
          data.slice(0, 6).map((f) => (
            <div key={`${f.productId}-${f.branchName}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  f.risk === 'critical' ? 'bg-destructive' : f.risk === 'high' ? 'bg-warning' : 'bg-info',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.productName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {f.branchName} · {f.currentStock} und
                  {f.predictedDaysUntilStockout !== null && ` · ~${Math.round(f.predictedDaysUntilStockout)} días`}
                </p>
              </div>
              <Badge variant="secondary" className="tabular">+{f.recommendedReorderQty}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SellerHome() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {user?.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">¿Qué quieres hacer hoy?</p>
      </div>
      <QuickActions />
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const branchId = useUiStore((s) => s.branchId);
  const { data: branches = [] } = useBranches();
  const [days, setDays] = useState(30);
  const canAnalytics = user?.permissions.includes('analytics:read') ?? false;

  const { data, isLoading, isError, error, refetch } = useQuery<Overview>({
    queryKey: ['analytics', 'overview', branchId, days],
    enabled: canAnalytics,
    refetchInterval: 60_000,
    queryFn: async () =>
      (await apiClient.get('/analytics/overview', { params: { days, branchId: branchId || undefined } })).data.data,
  });

  if (!canAnalytics) return <SellerHome />;

  const k = data?.kpis;
  const branchName = branches.find((b) => b.id === branchId)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user?.firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resumen de {branchName ?? 'todas las sedes'} · últimos {days} días
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-sm">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  days === p.days ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <QuickActions />
        </div>
      </div>

      {isError ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Ingresos"
              value={formatCurrency(k?.revenue ?? 0)}
              change={k?.revenueChange}
              hint="vs. periodo anterior"
              icon={CircleDollarSign}
              isLoading={isLoading}
            />
            <StatCard
              title="Ventas"
              value={(k?.salesCount ?? 0).toLocaleString('es-CO')}
              change={k?.salesCountChange}
              hint="transacciones"
              icon={ShoppingBag}
              tone="info"
              isLoading={isLoading}
            />
            <StatCard
              title="Ticket promedio"
              value={formatCurrency(k?.averageTicket ?? 0)}
              change={k?.averageTicketChange}
              hint="por venta"
              icon={Receipt}
              tone="warning"
              isLoading={isLoading}
            />
            <StatCard
              title="Utilidad bruta"
              value={formatCurrency(k?.grossProfit ?? 0)}
              change={k?.grossProfitChange}
              hint={`margen ${k?.grossMargin ?? 0}%`}
              icon={TrendingUp}
              tone="success"
              isLoading={isLoading}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Ingresos diarios</CardTitle>
                <CardDescription>Ventas completadas, impuestos incluidos</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                {isLoading ? <Skeleton className="h-[280px] w-full" /> : <Charts.Trend data={data?.trend ?? []} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Medios de pago</CardTitle>
                <CardDescription>Distribución de lo recaudado</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[170px] w-full" />
                ) : data?.byPayment.length ? (
                  <Charts.Payments data={data.byPayment} />
                ) : (
                  <EmptyState title="Sin pagos en el periodo" className="py-8" />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Rendimiento por sede</CardTitle>
                <CardDescription>Ingresos de cada tienda en el periodo</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[180px] w-full" />
                ) : data?.byBranch.length ? (
                  <Charts.Branches data={data.byBranch} />
                ) : (
                  <EmptyState title="Aún no hay ventas" className="py-8" />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Productos estrella</CardTitle>
                <CardDescription>Más vendidos por ingresos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                  : (data?.topProducts ?? []).slice(0, 6).map((p, i) => {
                      const max = data?.topProducts[0]?.revenue || 1;
                      return (
                        <div key={p.productId}>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate">
                              <span className="mr-2 text-xs text-muted-foreground">{i + 1}</span>
                              {p.name}
                            </span>
                            <span className="tabular shrink-0 font-medium">{formatCompact(p.revenue)}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${(p.revenue / max) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Últimas ventas</CardTitle>
                  <CardDescription>Actividad más reciente</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/dashboard/sales">
                    Ver todas <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {isLoading ? (
                  <div className="space-y-2 px-5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="divide-y">
                    {(data?.recentSales ?? []).map((s) => {
                      const st = SALE_STATUS[s.status] ?? { label: s.status, tone: 'secondary' as const };
                      return (
                        <div key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{s.customer}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              #{s.saleNumber} · {s.branch} · {label(PAYMENT_LABELS, s.payment)}
                            </p>
                          </div>
                          <Badge variant={st.tone} className="hidden sm:inline-flex">
                            {st.label}
                          </Badge>
                          <div className="w-28 text-right">
                            <p className="tabular text-sm font-semibold">{formatCurrency(s.total)}</p>
                            <p className="text-[11px] text-muted-foreground">{formatRelativeTime(s.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Inventario</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Valor al costo</p>
                    <p className="tabular mt-1 font-semibold">{formatCompact(data?.inventory.stockValue ?? 0)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Valor de venta</p>
                    <p className="tabular mt-1 font-semibold">{formatCompact(data?.inventory.stockRetailValue ?? 0)}</p>
                  </div>
                  <div className="rounded-lg bg-warning/10 p-3">
                    <p className="text-xs text-muted-foreground">Stock bajo</p>
                    <p className="tabular mt-1 font-semibold text-warning">{data?.inventory.lowStock ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-3">
                    <p className="text-xs text-muted-foreground">Agotados</p>
                    <p className="tabular mt-1 font-semibold text-destructive">{data?.inventory.outOfStock ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
              <StockRiskCard branchId={branchId} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
