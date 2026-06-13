'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type TrendPoint = { date: string; revenue: number; transactions: number };
type TopProduct = { productId: string; productName: string; _sum: { quantity: number; subtotal: number }; _count: { id: number } };

interface DashboardChartsProps {
  trend: TrendPoint[];
  topProducts: TopProduct[];
  trendLoading: boolean;
  topLoading: boolean;
}

export default function DashboardCharts({ trend, topProducts, trendLoading, topLoading }: DashboardChartsProps) {
  const topChart = topProducts.map(p => ({
    name: p.productName,
    sold: Number(p._sum?.quantity ?? 0),
    revenue: Number(p._sum?.subtotal ?? 0),
  }));

  return (
    <Tabs defaultValue="trend">
      <TabsList>
        <TabsTrigger value="trend">Tendencia de ventas</TabsTrigger>
        <TabsTrigger value="products">Top Productos</TabsTrigger>
      </TabsList>

      <TabsContent value="trend">
        <Card>
          <CardHeader>
            <CardTitle>Ventas diarias — últimos 30 días</CardTitle>
            <CardDescription>Ingresos y número de transacciones</CardDescription>
          </CardHeader>
          <CardContent>
            {trendLoading ? <Skeleton className="h-64 w-full" /> : trend.length === 0 ? (
              <p className="text-center text-muted-foreground py-16">Sin datos de ventas en los últimos 30 días</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tickFormatter={(v) => v.slice(5)} />
                  <YAxis className="text-xs" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number, name: string) => [name === 'revenue' ? formatCurrency(v) : v, name === 'revenue' ? 'Ingresos' : 'Transacciones']} />
                  <Legend formatter={(v) => v === 'revenue' ? 'Ingresos' : 'Transacciones'} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="transactions" stroke="hsl(var(--chart-2))" fill="none" strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="products">
        <Card>
          <CardHeader>
            <CardTitle>Productos más vendidos</CardTitle>
            <CardDescription>Por unidades e ingresos este mes</CardDescription>
          </CardHeader>
          <CardContent>
            {topLoading ? <Skeleton className="h-64 w-full" /> : topChart.length === 0 ? (
              <p className="text-center text-muted-foreground py-16">Sin ventas registradas este mes</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip formatter={(v: number, name: string) => [name === 'revenue' ? formatCurrency(v) : v, name === 'revenue' ? 'Ingresos' : 'Unidades']} />
                  <Legend formatter={(v) => v === 'revenue' ? 'Ingresos' : 'Unidades vendidas'} />
                  <Bar dataKey="sold" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="sold" />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="revenue" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
