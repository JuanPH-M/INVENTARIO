'use client';

import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, DollarSign, Package, ShoppingCart, TrendingDown, TrendingUp, Truck,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

type DashboardData = {
  period: { start: string; end: string };
  sales: { total: number; count: number; averageTicket: number; totalDiscount: number };
  purchases: { total: number; count: number };
  inventory: { activeProducts: number; stockLines: number };
  operations: { openIncidents: number; monthlySubscriptionCost: number };
};

type TrendPoint = { date: string; revenue: number; transactions: number };
type TopProduct = { productId: string; productName: string; _sum: { quantity: number; subtotal: number }; _count: { id: number } };

const DashboardCharts = dynamic(() => import('./dashboard-charts'), {
  loading: () => <Skeleton className="h-[340px] w-full rounded-lg" />,
  ssr: false,
});

function StatCard({ title, value, sub, icon: Icon, highlight = false, isLoading }: {
  title: string; value: string; sub?: string; icon: React.ElementType; highlight?: boolean; isLoading: boolean;
}) {
  return (
    <Card className={highlight ? 'border-yellow-300 dark:border-yellow-700' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${highlight ? 'text-yellow-500' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-32" /> : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const { data } = await apiClient.get('/analytics/dashboard');
      return data.data;
    },
    refetchInterval: 30_000,
  });

  const { data: trend = [], isLoading: trendLoading } = useQuery<TrendPoint[]>({
    queryKey: ['sales-trend'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/analytics/sales-trend');
        return Array.isArray(data.data) ? data.data : [];
      } catch { return []; }
    },
    refetchInterval: 30_000,
  });

  const { data: topProducts = [], isLoading: topLoading } = useQuery<TopProduct[]>({
    queryKey: ['top-products'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/analytics/top-products', { params: { limit: 8 } });
        return Array.isArray(data.data) ? data.data : [];
      } catch { return []; }
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Resumen del mes actual</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Ingresos del mes"
          value={formatCurrency(data?.sales?.total ?? 0)}
          sub={`${data?.sales?.count ?? 0} venta(s) · Ticket promedio: ${formatCurrency(data?.sales?.averageTicket ?? 0)}`}
          icon={DollarSign}
          isLoading={isLoading}
        />
        <StatCard
          title="Ventas registradas"
          value={String(data?.sales?.count ?? 0)}
          sub={data?.sales?.totalDiscount ? `Descuentos: ${formatCurrency(data.sales.totalDiscount)}` : undefined}
          icon={ShoppingCart}
          isLoading={isLoading}
        />
        <StatCard
          title="Compras del mes"
          value={formatCurrency(data?.purchases?.total ?? 0)}
          sub={`${data?.purchases?.count ?? 0} orden(es) de compra`}
          icon={Truck}
          isLoading={isLoading}
        />
        <StatCard
          title="Productos activos"
          value={String(data?.inventory?.activeProducts ?? 0)}
          sub={`${data?.inventory?.stockLines ?? 0} líneas de stock`}
          icon={Package}
          isLoading={isLoading}
        />
      </div>

      {(data?.operations?.openIncidents ?? 0) > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {data?.operations?.openIncidents} incidente(s) abierto(s)
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400">Revisa el módulo de incidencias</p>
            </div>
          </CardContent>
        </Card>
      )}

      <DashboardCharts
        trend={trend}
        topProducts={topProducts}
        trendLoading={trendLoading}
        topLoading={topLoading}
      />

      {/* Resumen financiero */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" /> Ingresos vs Gastos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Ingresos por ventas</span>
                  <span className="font-semibold text-green-600">{formatCurrency(data?.sales?.total ?? 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Compras realizadas</span>
                  <span className="font-semibold text-red-600">-{formatCurrency(data?.purchases?.total ?? 0)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="text-sm font-medium">Balance estimado</span>
                  <span className={`font-bold ${(data?.sales?.total ?? 0) - (data?.purchases?.total ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency((data?.sales?.total ?? 0) - (data?.purchases?.total ?? 0))}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-500" /> Métricas de inventario
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Productos activos</span>
                  <Badge variant="secondary">{data?.inventory?.activeProducts ?? 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Líneas de stock registradas</span>
                  <Badge variant="outline">{data?.inventory?.stockLines ?? 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Incidentes abiertos</span>
                  <Badge variant={data?.operations?.openIncidents ? 'destructive' : 'secondary'}>{data?.operations?.openIncidents ?? 0}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
