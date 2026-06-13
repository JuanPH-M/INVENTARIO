'use client';

import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/skeleton';

type TrendPoint = { date: string; revenue: number; transactions: number };
type TopProduct = { productId: string; productName: string; _sum: { quantity: number; subtotal: number } };
type BranchStat = { branchId: string; _sum: { total: number }; _count: { id: number } };

const AnalyticsCharts = dynamic(() => import('./analytics-charts'), {
  loading: () => <Skeleton className="h-[380px] w-full rounded-lg" />,
  ssr: false,
});

export default function AnalyticsPage() {
  const { data: trend = [], isLoading: trendLoading } = useQuery<TrendPoint[]>({
    queryKey: ['analytics-trend'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/analytics/sales-trend');
        return Array.isArray(data.data) ? data.data : [];
      } catch { return []; }
    },
  });

  const { data: topProducts = [], isLoading: topLoading } = useQuery<TopProduct[]>({
    queryKey: ['analytics-top-products'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/analytics/top-products', { params: { limit: 10 } });
        return Array.isArray(data.data) ? data.data : [];
      } catch { return []; }
    },
  });

  const { data: topBranches = [], isLoading: branchLoading } = useQuery<BranchStat[]>({
    queryKey: ['analytics-top-branches'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/analytics/top-branches');
        return Array.isArray(data.data) ? data.data : [];
      } catch { return []; }
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Analíticas</h2>
        <p className="text-muted-foreground text-sm">Análisis detallado del rendimiento del negocio</p>
      </div>
      <AnalyticsCharts
        trend={trend}
        topProducts={topProducts}
        topBranches={topBranches}
        trendLoading={trendLoading}
        topLoading={topLoading}
        branchLoading={branchLoading}
      />
    </div>
  );
}
