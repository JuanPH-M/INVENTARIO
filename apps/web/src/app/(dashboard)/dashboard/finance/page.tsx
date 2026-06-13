'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Search } from 'lucide-react';
import { apiClient, type PaginatedResponse } from '@/lib/api-client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

type Transaction = {
  id: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: number;
  description: string;
  category?: string;
  createdAt: string;
  reference?: string;
};

const typeConfig: Record<string, { label: string; variant: 'success' | 'destructive' | 'secondary' }> = {
  INCOME: { label: 'Ingreso', variant: 'success' },
  EXPENSE: { label: 'Egreso', variant: 'destructive' },
  TRANSFER: { label: 'Transferencia', variant: 'secondary' },
};

export default function FinancePage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<PaginatedResponse<Transaction>['data']>({
    queryKey: ['transactions', search, page],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/finance/transactions', { params: { search, page, limit: 20 } });
        const p = data.data;
        return { items: Array.isArray(p.data) ? p.data : [], total: p.meta?.total ?? 0, page: p.meta?.page ?? 1, limit: p.meta?.limit ?? 20, totalPages: p.meta?.totalPages ?? 1 };
      } catch {
        return { items: [], total: 0, page: 1, limit: 20, totalPages: 1 };
      }
    },
  });

  const transactions = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Finanzas</h2>
        <p className="text-muted-foreground text-sm">Historial de transacciones financieras</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar transacciones..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Descripción</TableHead><TableHead>Categoría</TableHead><TableHead>Referencia</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(10)].map((_, i) => <TableRow key={i}>{[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>)
                : transactions.length === 0
                ? <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground"><DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />No hay transacciones</TableCell></TableRow>
                : transactions.map((t) => {
                    const tc = typeConfig[t.type] ?? { label: t.type, variant: 'secondary' as const };
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</TableCell>
                        <TableCell><Badge variant={tc.variant}>{tc.label}</Badge></TableCell>
                        <TableCell>{t.description}</TableCell>
                        <TableCell className="text-muted-foreground">{t.category ?? '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{t.reference ?? '-'}</TableCell>
                        <TableCell className={`text-right font-medium ${t.type === 'INCOME' ? 'text-green-600' : t.type === 'EXPENSE' ? 'text-red-600' : ''}`}>
                          {t.type === 'INCOME' ? '+' : t.type === 'EXPENSE' ? '-' : ''}{formatCurrency(t.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-sm self-center text-muted-foreground">Pág. {page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
        </div>
      )}
    </div>
  );
}
