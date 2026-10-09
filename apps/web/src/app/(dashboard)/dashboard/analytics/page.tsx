'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CircleDollarSign, Landmark, Percent, Receipt, ShoppingBag, TrendingUp, Truck } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn, formatCompact, formatCurrency, formatNumber } from '@/lib/utils';
import { PAYMENT_LABELS, label } from '@/lib/labels';
import { useUiStore } from '@/stores/ui.store';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { ErrorState } from '@/components/common/error-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const Trend = dynamic(() => import('@/components/charts/business-charts').then((m) => m.RevenueTrendChart), { ssr: false });
const Branches = dynamic(() => import('@/components/charts/business-charts').then((m) => m.BranchBarChart), { ssr: false });
const Payments = dynamic(() => import('@/components/charts/business-charts').then((m) => m.PaymentMixChart), { ssr: false });

type Overview = {
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
    discounts: number;
    purchasesTotal: number;
    purchasesCount: number;
  };
  trend: Array<{ date: string; revenue: number; transactions: number }>;
  byBranch: Array<{ branchId: string; name: string; revenue: number; transactions: number }>;
  byPayment: Array<{ type: string; amount: number; count: number }>;
  topProducts: Array<{ productId: string; name: string; quantity: number; revenue: number }>;
};

const PERIODS = [7, 30, 90, 180, 365];

export default function AnalyticsPage() {
  const branchId = useUiStore((s) => s.branchId);
  const [days, setDays] = useState(90);
  const { data, isLoading, isError, error, refetch } = useQuery<Overview>({
    queryKey: ['analytics', 'overview', branchId, days],
    queryFn: async () => (await apiClient.get('/analytics/overview', { params: { days, branchId: branchId || undefined } })).data.data,
  });
  const k = data?.kpis;
  const totalBranches = data?.byBranch.reduce((s, b) => s + b.revenue, 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analíticas"
        description="Desempeño comercial comparado con el periodo anterior"
        icon={BarChart3}
        actions={
          <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-sm">
            {PERIODS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  days === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {d === 365 ? '1 año' : `${d} días`}
              </button>
            ))}
          </div>
        }
      />

      {isError ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Ingresos" value={formatCurrency(k?.revenue ?? 0)} change={k?.revenueChange} icon={CircleDollarSign} isLoading={isLoading} />
            <StatCard title="Transacciones" value={formatNumber(k?.salesCount ?? 0)} change={k?.salesCountChange} icon={ShoppingBag} tone="info" isLoading={isLoading} />
            <StatCard title="Ticket promedio" value={formatCurrency(k?.averageTicket ?? 0)} change={k?.averageTicketChange} icon={Receipt} tone="warning" isLoading={isLoading} />
            <StatCard title="Utilidad bruta" value={formatCurrency(k?.grossProfit ?? 0)} change={k?.grossProfitChange} icon={TrendingUp} tone="success" isLoading={isLoading} />
            <StatCard title="Margen bruto" value={`${k?.grossMargin ?? 0}%`} hint="sobre ventas netas" icon={Percent} tone="success" isLoading={isLoading} />
            <StatCard title="Impuestos recaudados" value={formatCurrency(k?.taxCollected ?? 0)} icon={Landmark} tone="info" isLoading={isLoading} />
            <StatCard title="Descuentos otorgados" value={formatCurrency(k?.discounts ?? 0)} icon={Percent} tone="warning" isLoading={isLoading} />
            <StatCard title="Compras recibidas" value={formatCurrency(k?.purchasesTotal ?? 0)} hint={`${k?.purchasesCount ?? 0} orden(es)`} icon={Truck} tone="primary" isLoading={isLoading} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Evolución de ingresos</CardTitle>
              <CardDescription>Ventas diarias completadas</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">{isLoading ? <Skeleton className="h-[280px] w-full" /> : <Trend data={data?.trend ?? []} />}</CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Comparativo de sedes</CardTitle>
                <CardDescription>Participación de cada tienda en los ingresos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? <Skeleton className="h-[180px] w-full" /> : <Branches data={data?.byBranch ?? []} />}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sede</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Ticket prom.</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Part.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.byBranch ?? []).map((b) => (
                      <TableRow key={b.branchId}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="tabular text-right">{formatNumber(b.transactions)}</TableCell>
                        <TableCell className="tabular text-right">{formatCurrency(b.transactions ? b.revenue / b.transactions : 0)}</TableCell>
                        <TableCell className="tabular text-right font-semibold">{formatCurrency(b.revenue)}</TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">
                          {totalBranches ? Math.round((b.revenue / totalBranches) * 100) : 0}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Medios de pago</CardTitle>
                <CardDescription>Recaudo por método</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? <Skeleton className="h-[170px] w-full" /> : <Payments data={data?.byPayment ?? []} />}
                <div className="space-y-2 text-sm">
                  {(data?.byPayment ?? []).map((p) => (
                    <div key={p.type} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {label(PAYMENT_LABELS, p.type)} · {p.count}
                      </span>
                      <span className="tabular font-medium">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Productos más vendidos</CardTitle>
              <CardDescription>Ranking por ingresos en el periodo</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.topProducts ?? []).map((p, i) => (
                    <TableRow key={p.productId}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(p.quantity)}</TableCell>
                      <TableCell className="tabular text-right font-semibold">{formatCompact(p.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
