'use client';

import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { apiClient } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
];

type TrendPoint = { date: string; revenue: number; transactions: number };
type TopProduct = { productId: string; productName: string; _sum: { quantity: number; subtotal: number } };
type BranchStat = { branchId: string; _sum: { total: number }; _count: { id: number } };

export default function AnalyticsPage() {
  const { data: trend, isLoading: trendLoading } = useQuery<TrendPoint[]>({
    queryKey: ['analytics-trend'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/analytics/sales-trend');
        return Array.isArray(data.data) ? data.data : [];
      } catch { return []; }
    },
  });

  const { data: topProducts, isLoading: topLoading } = useQuery<TopProduct[]>({
    queryKey: ['analytics-top-products'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/analytics/top-products', { params: { limit: 10 } });
        return Array.isArray(data.data) ? data.data : [];
      } catch { return []; }
    },
  });

  const { data: topBranches, isLoading: branchLoading } = useQuery<BranchStat[]>({
    queryKey: ['analytics-top-branches'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/analytics/top-branches');
        return Array.isArray(data.data) ? data.data : [];
      } catch { return []; }
    },
  });

  const trendData = (trend ?? []).map(p => ({ ...p, date: p.date.slice(5) }));
  const topChart = (topProducts ?? []).map(p => ({
    name: p.productName,
    sold: Number(p._sum?.quantity ?? 0),
    revenue: Number(p._sum?.subtotal ?? 0),
  }));
  const branchChart = (topBranches ?? []).map(b => ({
    name: b.branchId.slice(0, 8) + '…',
    total: Number(b._sum?.total ?? 0),
    count: b._count?.id ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Analíticas</h2>
        <p className="text-muted-foreground text-sm">Análisis detallado del rendimiento del negocio</p>
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Ventas por día</TabsTrigger>
          <TabsTrigger value="products">Top Productos</TabsTrigger>
          <TabsTrigger value="branches">Sucursales</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ingresos diarios — últimos 30 días</CardTitle>
              <CardDescription>Tendencia de ventas completadas</CardDescription>
            </CardHeader>
            <CardContent>
              {trendLoading ? <Skeleton className="h-64 w-full" /> : trendData.length === 0 ? (
                <p className="text-center text-muted-foreground py-16">Sin datos de ventas en los últimos 30 días</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number, name: string) => [name === 'revenue' ? formatCurrency(v) : v, name === 'revenue' ? 'Ingresos' : 'Transacciones']} />
                    <Legend formatter={(v) => v === 'revenue' ? 'Ingresos' : 'N° Transacciones'} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="revenue" />
                    <Line type="monotone" dataKey="transactions" stroke="hsl(var(--chart-2))" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="transactions" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Productos más vendidos</CardTitle>
              <CardDescription>Por unidades vendidas e ingresos generados este mes</CardDescription>
            </CardHeader>
            <CardContent>
              {topLoading ? <Skeleton className="h-64 w-full" /> : topChart.length === 0 ? (
                <p className="text-center text-muted-foreground py-16">Sin ventas de productos este mes</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" className="text-xs" width={120} />
                    <Tooltip formatter={(v: number, name: string) => [name === 'revenue' ? formatCurrency(v) : v, name === 'revenue' ? 'Ingresos' : 'Unidades']} />
                    <Legend formatter={(v) => v === 'revenue' ? 'Ingresos' : 'Unidades'} />
                    <Bar dataKey="sold" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="sold" />
                    <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} name="revenue" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branches" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rendimiento por sucursal</CardTitle>
              <CardDescription>Últimos 30 días — ventas completadas</CardDescription>
            </CardHeader>
            <CardContent>
              {branchLoading ? <Skeleton className="h-64 w-full" /> : branchChart.length === 0 ? (
                <p className="text-center text-muted-foreground py-16">Sin datos por sucursal</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={branchChart} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {branchChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {branchChart.map((b, i) => (
                      <div key={i} className="flex items-center justify-between rounded border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-sm font-mono">{b.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatCurrency(b.total)}</p>
                          <p className="text-xs text-muted-foreground">{b.count} venta(s)</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
