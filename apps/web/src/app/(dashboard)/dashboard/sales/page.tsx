'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Download, Eye, Loader2, Printer, ScanBarcode, Search, ShoppingCart } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { PAYMENT_LABELS, SALE_STATUS, label } from '@/lib/labels';
import { useDebounce } from '@/hooks/use-debounce';
import { useUiStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Receipt, type ReceiptSale } from '@/components/sales/receipt';
import { EntityDocuments } from '@/components/common/entity-documents';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Paginator } from '@/components/ui/paginator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type SaleRow = {
  id: string;
  saleNumber: string;
  createdAt: string;
  status: string;
  type: string;
  total: string;
  customerName: string | null;
  branch: { name: string } | null;
  client: { firstName: string | null; lastName: string | null; businessName: string | null } | null;
  payments: Array<{ type: string; amount: string }>;
  _count: { items: number };
};

type SaleDetail = ReceiptSale & {
  id: string;
  status: string;
  branch: { name: string } | null;
  client: { firstName: string | null; lastName: string | null; businessName: string | null } | null;
  voidReason: string | null;
  voidedAt: string | null;
};

const customerOf = (s: { client: SaleRow['client']; customerName?: string | null }) =>
  s.client?.businessName || [s.client?.firstName, s.client?.lastName].filter(Boolean).join(' ') || s.customerName || 'Consumidor final';

const today = () => new Date().toISOString().slice(0, 10);

export default function SalesPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const branchId = useUiStore((s) => s.branchId);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<SaleDetail | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const debounced = useDebounce(search);

  const params = {
    page,
    limit: 20,
    search: debounced || undefined,
    status: status === 'all' ? undefined : status,
    branchId: branchId || undefined,
    dateFrom: dateFrom ? `${dateFrom}T00:00:00` : undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
  };

  const { data, isLoading, isError, error, refetch } = useQuery<Paginated<SaleRow>>({
    queryKey: ['sales', params],
    queryFn: async () => (await apiClient.get('/sales', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  const { data: detail, isLoading: detailLoading } = useQuery<SaleDetail>({
    queryKey: ['sales', 'detail', viewId],
    enabled: !!viewId,
    queryFn: async () => (await apiClient.get(`/sales/${viewId}`)).data.data,
  });

  const voidSale = useMutation({
    mutationFn: async () => apiClient.patch(`/sales/${voiding?.id}/void`, { reason: voidReason }),
    onSuccess: () => {
      toast({ title: 'Venta anulada', description: 'Se devolvió el inventario y se reversaron caja y finanzas.' });
      setVoiding(null);
      setVoidReason('');
      void qc.invalidateQueries({ queryKey: ['sales'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo anular', description: getErrorMessage(err) }),
  });

  const exportExcel = async () => {
    try {
      const res = await apiClient.get('/reports/sales', {
        params: { format: 'xlsx', from: dateFrom || undefined, to: dateTo || undefined, branchId: branchId || undefined },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ventas-${today()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo exportar', description: getErrorMessage(err) });
    }
  };

  const rows = data?.data ?? [];
  const canVoid = user?.permissions.includes('sales:void') ?? false;
  const canCreate = user?.permissions.includes('sales:create') ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventas"
        description="Historial de ventas de todas las sedes, comprobantes y anulaciones"
        icon={ShoppingCart}
        actions={
          <>
            {user?.permissions.includes('reports:read') && (
              <Button variant="outline" onClick={exportExcel}>
                <Download /> Exportar
              </Button>
            )}
            {canCreate && (
              <Button asChild>
                <Link href="/dashboard/pos">
                  <ScanBarcode /> Nueva venta
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por número, cliente o documento"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="lg:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(SALE_STATUS).map(([value, s]) => (
                <SelectItem key={value} value={value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-40" aria-label="Desde" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-40" aria-label="Hasta" />
          </div>
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venta</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Sede</TableHead>
                  <TableHead className="hidden lg:table-cell">Pago</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : rows.map((s) => {
                      const st = SALE_STATUS[s.status] ?? { label: s.status, tone: 'secondary' as const };
                      return (
                        <TableRow key={s.id} className="cursor-pointer" onClick={() => setViewId(s.id)}>
                          <TableCell>
                            <p className="font-medium">#{s.saleNumber}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</p>
                          </TableCell>
                          <TableCell>
                            <p className="max-w-[200px] truncate">{customerOf(s)}</p>
                            <p className="text-xs text-muted-foreground">{s._count.items} producto(s)</p>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{s.branch?.name}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {[...new Set(s.payments.map((p) => label(PAYMENT_LABELS, p.type)))].join(' + ') || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={st.tone}>{st.label}</Badge>
                          </TableCell>
                          <TableCell className="tabular text-right font-semibold">{formatCurrency(Number(s.total))}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" aria-label="Ver detalle">
                              <Eye />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
            {!isLoading && rows.length === 0 && (
              <EmptyState icon={ShoppingCart} title="No hay ventas" description="Ajusta los filtros o registra una venta en el punto de venta." />
            )}
            {(data?.meta.totalPages ?? 0) > 1 && (
              <div className="border-t p-4">
                <Paginator page={page} totalPages={data!.meta.totalPages} total={data!.meta.total} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog open={!!viewId} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de la venta</DialogTitle>
            {detail?.status === 'voided' && (
              <DialogDescription className="text-destructive">Anulada: {detail.voidReason}</DialogDescription>
            )}
          </DialogHeader>
          {detailLoading || !detail ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <Receipt
              sale={{ ...detail, customerName: customerOf(detail) }}
              companyName={user?.tenant?.name}
              branchName={detail.branch?.name}
            />
          )}
          {detail && <EntityDocuments entity="sales" id={detail.id} canUpload={user?.permissions.includes('documents:create') ?? false} />}
          <DialogFooter className="gap-2">
            {detail && canVoid && ['completed', 'pending'].includes(detail.status) && (
              <Button variant="outline" className="text-destructive" onClick={() => { setVoiding(detail); setViewId(null); }}>
                <Ban /> Anular
              </Button>
            )}
            <Button onClick={() => window.print()} disabled={!detail}>
              <Printer /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anular venta #{voiding?.saleNumber}</DialogTitle>
            <DialogDescription>
              Se devolverán las unidades al inventario y se reversarán el ingreso y el efectivo en caja. Esta acción queda registrada en auditoría.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="void-reason">Motivo</Label>
            <Input id="void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Ej. Error en el cobro" autoFocus />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVoiding(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={voidReason.trim().length < 3 || voidSale.isPending} onClick={() => voidSale.mutate()}>
              {voidSale.isPending && <Loader2 className="animate-spin" />}
              Anular venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
