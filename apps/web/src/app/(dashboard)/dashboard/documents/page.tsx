'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileText, Search } from 'lucide-react';
import { apiClient, type PaginatedResponse } from '@/lib/api-client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

type Document = {
  id: string;
  type: 'INVOICE' | 'QUOTE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  number: string;
  total: number;
  status: string;
  createdAt: string;
  client?: { firstName: string; lastName: string };
  fileUrl?: string;
};

const typeConfig: Record<string, { label: string }> = {
  INVOICE: { label: 'Factura' },
  QUOTE: { label: 'Cotización' },
  CREDIT_NOTE: { label: 'Nota crédito' },
  DEBIT_NOTE: { label: 'Nota débito' },
};

export default function DocumentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<PaginatedResponse<Document>['data']>({
    queryKey: ['documents', search, page],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/documents', { params: { search, page, limit: 15 } });
        const p = data.data;
        return { items: Array.isArray(p.data) ? p.data : [], total: p.meta?.total ?? 0, page: p.meta?.page ?? 1, limit: p.meta?.limit ?? 15, totalPages: p.meta?.totalPages ?? 1 };
      } catch {
        return { items: [], total: 0, page: 1, limit: 15, totalPages: 1 };
      }
    },
  });

  const documents = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Documentos</h2>
        <p className="text-muted-foreground text-sm">Facturas, cotizaciones y notas</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar documentos..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Tipo</TableHead><TableHead>Cliente</TableHead><TableHead>Fecha</TableHead><TableHead className="text-center">Estado</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(8)].map((_, i) => <TableRow key={i}>{[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>)
                : documents.length === 0
                ? <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />No hay documentos</TableCell></TableRow>
                : documents.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.number}</TableCell>
                      <TableCell>{typeConfig[d.type]?.label ?? d.type}</TableCell>
                      <TableCell>{d.client ? `${d.client.firstName} ${d.client.lastName}` : '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</TableCell>
                      <TableCell className="text-center"><Badge variant="secondary">{d.status}</Badge></TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(d.total)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {d.fileUrl && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={d.fileUrl} target="_blank" rel="noreferrer"><Eye className="h-3.5 w-3.5" /></a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
