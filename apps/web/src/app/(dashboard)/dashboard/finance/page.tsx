'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Loader2, Plus, Receipt, Scale } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { FINANCE_TYPES } from '@/lib/labels';
import { useBranches } from '@/hooks/use-branches';
import { useUiStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/common/page-header';
import { StatCard } from '@/components/common/stat-card';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
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

type Transaction = {
  id: string;
  type: string;
  description: string;
  amount: string;
  currency: string;
  referenceType: string | null;
  transactionDate: string;
  branch: { name: string } | null;
};

type Summary = { totalRevenue: number; totalExpenses: number; grossProfit: number; grossMargin: number };

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

const ORIGIN: Record<string, string> = {
  sale: 'Venta',
  sale_void: 'Anulación',
  purchase_order: 'Compra',
  manual: 'Manual',
};

export default function FinancePage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const branchId = useUiStore((s) => s.branchId);
  const { data: branches = [] } = useBranches();
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ type: 'income' | 'expense'; description: string; amount: string; branchId: string; transactionDate: string } | null>(null);

  const range = { branchId: branchId || undefined, dateFrom, dateTo: `${dateTo}T23:59:59` };

  const summary = useQuery<Summary>({
    queryKey: ['finance', 'summary', range],
    queryFn: async () => (await apiClient.get('/finance/summary', { params: range })).data.data,
  });

  const params = { ...range, page, limit: 25, type: type === 'all' ? undefined : type };
  const list = useQuery<Paginated<Transaction>>({
    queryKey: ['finance', 'transactions', params],
    queryFn: async () => (await apiClient.get('/finance/transactions', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  const create = useMutation({
    mutationFn: async () =>
      apiClient.post('/finance/transactions', {
        type: form!.type,
        description: form!.description,
        amount: Number(form!.amount),
        branchId: form!.branchId || undefined,
        transactionDate: form!.transactionDate,
      }),
    onSuccess: () => {
      toast({ title: form?.type === 'expense' ? 'Gasto registrado' : 'Ingreso registrado' });
      setForm(null);
      void qc.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo registrar', description: getErrorMessage(err) }),
  });

  const s = summary.data;
  const rows = list.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanzas"
        description="Ingresos, egresos y resultado del periodo por sede"
        icon={Receipt}
        actions={
          user?.permissions.includes('finance:create') && (
            <>
              <Button variant="outline" onClick={() => setForm({ type: 'income', description: '', amount: '', branchId: branchId, transactionDate: today() })}>
                <ArrowUpRight /> Ingreso
              </Button>
              <Button onClick={() => setForm({ type: 'expense', description: '', amount: '', branchId: branchId, transactionDate: today() })}>
                <Plus /> Registrar gasto
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={dateFrom} max={dateTo} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-40" aria-label="Desde" />
        <span className="text-muted-foreground">—</span>
        <Input type="date" value={dateTo} min={dateFrom} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-40" aria-label="Hasta" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Ingresos" value={formatCurrency(s?.totalRevenue ?? 0)} icon={ArrowUpRight} tone="success" isLoading={summary.isLoading} />
        <StatCard title="Egresos" value={formatCurrency(s?.totalExpenses ?? 0)} icon={ArrowDownRight} tone="destructive" isLoading={summary.isLoading} />
        <StatCard
          title="Resultado neto"
          value={formatCurrency(s?.grossProfit ?? 0)}
          hint={`margen ${(s?.grossMargin ?? 0).toFixed(1)}%`}
          icon={Scale}
          tone="primary"
          isLoading={summary.isLoading}
        />
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <p className="text-sm font-semibold">Movimientos</p>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="income">Ingresos</SelectItem>
              <SelectItem value="expense">Egresos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="hidden md:table-cell">Sede</TableHead>
                  <TableHead className="hidden sm:table-cell">Origen</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : rows.map((t) => {
                      const ft = FINANCE_TYPES[t.type] ?? { label: t.type, tone: 'secondary' as const };
                      const sign = t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0;
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(t.transactionDate)}</TableCell>
                          <TableCell className="font-medium">{t.description}</TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{t.branch?.name ?? 'General'}</TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">{ORIGIN[t.referenceType ?? ''] ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant={ft.tone}>{ft.label}</Badge>
                          </TableCell>
                          <TableCell className={cn('tabular text-right font-semibold', sign > 0 ? 'text-success' : sign < 0 ? 'text-destructive' : '')}>
                            {sign > 0 ? '+' : sign < 0 ? '−' : ''}
                            {formatCurrency(Number(t.amount))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
            {!list.isLoading && rows.length === 0 && <EmptyState icon={Receipt} title="Sin movimientos en el periodo" />}
            {(list.data?.meta.totalPages ?? 0) > 1 && (
              <div className="border-t p-4">
                <Paginator page={page} totalPages={list.data!.meta.totalPages} total={list.data!.meta.total} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.type === 'expense' ? 'Registrar gasto' : 'Registrar ingreso'}</DialogTitle>
            <DialogDescription>Arriendo, nómina, servicios públicos, transporte u otros conceptos que no provienen de ventas o compras.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="fx-desc">Concepto</Label>
                <Input id="fx-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ej. Arriendo local octubre" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fx-amount">Monto</Label>
                  <Input id="fx-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fx-date">Fecha</Label>
                  <Input id="fx-date" type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Sede</Label>
                <Select value={form.branchId || 'general'} onValueChange={(v) => setForm({ ...form, branchId: v === 'general' ? '' : v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General (toda la empresa)</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button disabled={!form || form.description.trim().length < 3 || !(Number(form.amount) > 0) || create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
