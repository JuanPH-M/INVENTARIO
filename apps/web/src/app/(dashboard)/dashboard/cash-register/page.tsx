'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Banknote, Loader2, Lock, Plus, Receipt, Unlock, Wallet } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { useCan } from '@/hooks/use-can';
import { useBranches } from '@/hooks/use-branches';
import { toast } from '@/hooks/use-toast';
import { useUiStore } from '@/stores/ui.store';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Paginator } from '@/components/ui/paginator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Person = { firstName: string; lastName: string };
type Register = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  branchId: string;
  branch: { name: string };
  sessions: { id: string; openedAt: string; openedBy: Person }[];
};
type Movement = { id: string; type: string; amount: number | string; description: string | null; performedAt: string };
type Session = {
  id: string;
  status: string;
  openingAmount: number | string;
  expectedClosingAmount: number | string;
  openedAt: string;
  openedBy: Person;
  movements: Movement[];
};
type HistoryRow = {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number | string;
  expectedClosingAmount: number | string | null;
  actualClosingAmount: number | string | null;
  difference: number | string | null;
  cashRegister: { name: string; code: string };
  openedBy: Person;
  closedBy: Person | null;
};

const MOVEMENT: Record<string, { label: string; sign: 1 | -1 | 0 }> = {
  opening: { label: 'Apertura', sign: 0 },
  sale: { label: 'Venta en efectivo', sign: 1 },
  income: { label: 'Ingreso', sign: 1 },
  deposit: { label: 'Depósito / base', sign: 1 },
  expense: { label: 'Gasto', sign: -1 },
  withdrawal: { label: 'Retiro', sign: -1 },
  refund: { label: 'Devolución', sign: -1 },
  closing: { label: 'Cierre', sign: 0 },
};

const name = (p?: Person | null) => (p ? `${p.firstName} ${p.lastName}` : '—');

function OpenSessionDialog({ register, onClose }: { register: Register | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const open = useMutation({
    mutationFn: () => apiClient.post('/cash-register/sessions/open', { cashRegisterId: register!.id, openingAmount: Number(amount || 0) }),
    onSuccess: () => {
      toast({ title: 'Caja abierta', description: 'Ya puedes registrar ventas en efectivo en el POS.' });
      setAmount('');
      onClose();
      void qc.invalidateQueries({ queryKey: ['cash'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo abrir la caja', description: getErrorMessage(err) }),
  });

  return (
    <Dialog open={!!register} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Abrir {register?.name}</DialogTitle>
          <DialogDescription>Cuenta el efectivo con el que inicia el turno (la base).</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            open.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="opening">Base inicial</Label>
            <Input id="opening" autoFocus type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={open.isPending || Number(amount) < 0}>
              {open.isPending ? <Loader2 className="animate-spin" /> : <Unlock />} Abrir caja
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SessionPanel({ register }: { register: Register }) {
  const qc = useQueryClient();
  const canOpen = useCan('cash_register:open');
  const canClose = useCan('cash_register:close');
  const canMove = useCan('cash_register:movements');
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [moveType, setMoveType] = useState<string | null>(null);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [mv, setMv] = useState({ amount: '', description: '' });

  const { data: session, isLoading, isError, error, refetch } = useQuery<Session | null>({
    queryKey: ['cash', 'session', register.id],
    queryFn: async () => (await apiClient.get(`/cash-register/${register.id}/session/current`)).data.data ?? null,
    refetchInterval: 30_000,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['cash'] });

  const close = useMutation({
    mutationFn: () => apiClient.post(`/cash-register/sessions/${session!.id}/close`, { actualAmount: Number(counted || 0), notes: notes.trim() || undefined }),
    onSuccess: ({ data }) => {
      const diff = Number(data.data?.difference ?? 0);
      toast({
        title: 'Caja cerrada',
        description: diff === 0 ? 'El efectivo cuadró exactamente.' : `Diferencia de ${formatCurrency(diff)} (${diff > 0 ? 'sobrante' : 'faltante'}).`,
        variant: diff < 0 ? 'destructive' : undefined,
      });
      setClosing(false);
      setCounted('');
      setNotes('');
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo cerrar', description: getErrorMessage(err) }),
  });

  const move = useMutation({
    mutationFn: () =>
      apiClient.post(`/cash-register/sessions/${session!.id}/movements`, {
        type: moveType,
        amount: Number(mv.amount),
        description: mv.description.trim(),
      }),
    onSuccess: () => {
      toast({ title: 'Movimiento registrado' });
      setMoveType(null);
      setMv({ amount: '', description: '' });
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo registrar', description: getErrorMessage(err) }),
  });

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton className="h-72 w-full rounded-2xl" />;

  if (!session) {
    return (
      <Card>
        <EmptyState
          icon={Lock}
          title={`${register.name} está cerrada`}
          description="Abre la caja con la base del turno para registrar ventas en efectivo y movimientos."
          action={
            canOpen ? (
              <Button onClick={() => setOpening(true)}>
                <Unlock /> Abrir caja
              </Button>
            ) : undefined
          }
        />
        <OpenSessionDialog register={opening ? register : null} onClose={() => setOpening(false)} />
      </Card>
    );
  }

  const totals = session.movements.reduce<Record<string, number>>((acc, m) => {
    acc[m.type] = (acc[m.type] ?? 0) + Number(m.amount);
    return acc;
  }, {});
  const expected = Number(session.expectedClosingAmount);
  const inflow = (totals['sale'] ?? 0) + (totals['income'] ?? 0) + (totals['deposit'] ?? 0);
  const outflow = (totals['expense'] ?? 0) + (totals['withdrawal'] ?? 0) + (totals['refund'] ?? 0);
  const diff = counted === '' ? null : Number(counted) - expected;

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
          </span>
          <div>
            <p className="font-semibold">Caja abierta</p>
            <p className="text-sm text-muted-foreground">
              Desde {formatDateTime(session.openedAt)} por {name(session.openedBy)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {canMove && (
            <>
              <Button variant="outline" onClick={() => setMoveType('income')}>
                <ArrowDownLeft /> Ingreso
              </Button>
              <Button variant="outline" onClick={() => setMoveType('expense')}>
                <ArrowUpRight /> Gasto / retiro
              </Button>
            </>
          )}
          {canClose && (
            <Button variant="destructive" onClick={() => setClosing(true)}>
              <Lock /> Cerrar caja
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Base inicial" value={formatCurrency(Number(session.openingAmount))} icon={Wallet} tone="info" />
        <StatCard title="Ventas en efectivo" value={formatCurrency(totals['sale'] ?? 0)} icon={Receipt} tone="success" hint={`${session.movements.filter((m) => m.type === 'sale').length} ventas`} />
        <StatCard title="Otros ingresos − egresos" value={formatCurrency(inflow - (totals['sale'] ?? 0) - outflow)} icon={ArrowDownLeft} tone="warning" />
        <StatCard title="Debe haber en caja" value={formatCurrency(expected)} icon={Banknote} tone="primary" />
      </div>

      <Card>
        <div className="border-b px-4 py-3">
          <p className="font-semibold">Movimientos del turno</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hora</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="hidden md:table-cell">Detalle</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...session.movements].reverse().map((m) => {
              const t = MOVEMENT[m.type] ?? { label: m.type, sign: 0 as const };
              return (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(m.performedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.sign > 0 ? 'success' : t.sign < 0 ? 'warning' : 'secondary'}>{t.label}</Badge>
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground md:table-cell">{m.description ?? '—'}</TableCell>
                  <TableCell className={cn('text-right font-medium tabular-nums', t.sign > 0 && 'text-success', t.sign < 0 && 'text-destructive')}>
                    {t.sign > 0 ? '+' : t.sign < 0 ? '−' : ''}
                    {formatCurrency(Number(m.amount))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!moveType} onOpenChange={(o) => !o && setMoveType(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar movimiento</DialogTitle>
            <DialogDescription>Entradas o salidas de efectivo que no son ventas.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (Number(mv.amount) > 0 && mv.description.trim()) move.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={moveType ?? 'income'} onValueChange={setMoveType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Ingreso (entra dinero)</SelectItem>
                  <SelectItem value="deposit">Depósito / refuerzo de base</SelectItem>
                  <SelectItem value="expense">Gasto (pago con caja)</SelectItem>
                  <SelectItem value="withdrawal">Retiro (consignación, recogida)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mv-amount">Monto</Label>
              <Input id="mv-amount" autoFocus type="number" min="0.01" step="any" value={mv.amount} onChange={(e) => setMv((v) => ({ ...v, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mv-desc">Concepto *</Label>
              <Input id="mv-desc" value={mv.description} onChange={(e) => setMv((v) => ({ ...v, description: e.target.value }))} placeholder="Ej. Pago domicilio, recogida de efectivo" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMoveType(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!(Number(mv.amount) > 0) || !mv.description.trim() || move.isPending}>
                {move.isPending && <Loader2 className="animate-spin" />} Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={closing} onOpenChange={setClosing}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar {register.name}</DialogTitle>
            <DialogDescription>Cuenta el efectivo físico y regístralo. El sistema calcula la diferencia.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (counted !== '') close.mutate();
            }}
          >
            <div className="space-y-1 rounded-xl bg-muted/50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base</span>
                <span className="tabular-nums">{formatCurrency(Number(session.openingAmount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">+ Entradas</span>
                <span className="tabular-nums">{formatCurrency(inflow)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">− Salidas</span>
                <span className="tabular-nums">{formatCurrency(outflow)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Esperado</span>
                <span className="tabular-nums">{formatCurrency(expected)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="counted">Efectivo contado *</Label>
              <Input id="counted" autoFocus type="number" min="0" step="any" value={counted} onChange={(e) => setCounted(e.target.value)} />
              {diff !== null && (
                <p className={cn('text-sm font-medium', diff === 0 ? 'text-success' : diff > 0 ? 'text-warning' : 'text-destructive')}>
                  {diff === 0 ? 'Cuadra exacto' : `${diff > 0 ? 'Sobrante' : 'Faltante'} de ${formatCurrency(Math.abs(diff))}`}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="close-notes">Observaciones</Label>
              <Input id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={diff ? 'Explica la diferencia' : 'Opcional'} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setClosing(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={counted === '' || close.isPending}>
                {close.isPending ? <Loader2 className="animate-spin" /> : <Lock />} Cerrar caja
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionHistory() {
  const branchId = useUiStore((s) => s.branchId);
  const [page, setPage] = useState(1);
  const params = { page, limit: 15, branchId: branchId || undefined };
  const { data, isLoading, isError, error, refetch } = useQuery<Paginated<HistoryRow>>({
    queryKey: ['cash', 'history', params],
    queryFn: async () => (await apiClient.get('/cash-register/sessions', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  const rows = data?.data ?? [];

  return (
    <Card>
      {!isLoading && rows.length === 0 ? (
        <EmptyState icon={Receipt} title="Aún no hay turnos registrados" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Caja</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead className="hidden text-right md:table-cell">Esperado</TableHead>
                <TableHead className="hidden text-right md:table-cell">Contado</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map((s) => {
                    const d = s.difference === null ? null : Number(s.difference);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <p className="font-medium">{s.cashRegister.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{s.cashRegister.code}</p>
                        </TableCell>
                        <TableCell className="text-sm">
                          <p>{formatDateTime(s.openedAt)}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.status === 'open' ? 'Abierta' : `Cerró ${name(s.closedBy)}`}
                          </p>
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">
                          {s.expectedClosingAmount !== null ? formatCurrency(Number(s.expectedClosingAmount)) : '—'}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">
                          {s.actualClosingAmount !== null ? formatCurrency(Number(s.actualClosingAmount)) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.status === 'open' ? (
                            <Badge variant="success">En curso</Badge>
                          ) : d === null || d === 0 ? (
                            <span className="text-sm font-medium text-success">Cuadró</span>
                          ) : (
                            <span className={cn('text-sm font-medium tabular-nums', d > 0 ? 'text-warning' : 'text-destructive')}>
                              {d > 0 ? '+' : '−'}
                              {formatCurrency(Math.abs(d))}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
          {data?.meta && (
            <div className="border-t px-4 pb-3">
              <Paginator page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default function CashRegisterPage() {
  const qc = useQueryClient();
  const canManage = useCan('cash_register:manage');
  const activeBranch = useUiStore((s) => s.branchId);
  const { data: branches = [] } = useBranches();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', branchId: '' });

  const { data: registers = [], isLoading, isError, error, refetch } = useQuery<Register[]>({
    queryKey: ['cash', 'registers', activeBranch],
    queryFn: async () => (await apiClient.get('/cash-register', { params: { branchId: activeBranch || undefined } })).data.data ?? [],
  });

  const create = useMutation({
    mutationFn: () => apiClient.post('/cash-register', form),
    onSuccess: ({ data }) => {
      toast({ title: 'Caja creada' });
      setCreating(false);
      setSelectedId(data.data?.id ?? null);
      void qc.invalidateQueries({ queryKey: ['cash'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo crear la caja', description: getErrorMessage(err) }),
  });

  const selected = registers.find((r) => r.id === selectedId) ?? registers[0];

  const openCreate = () => {
    setForm({ name: `Caja ${registers.length + 1}`, code: `CAJA-${registers.length + 1}`, branchId: activeBranch || branches[0]?.id || '' });
    setCreating(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja"
        description="Apertura, arqueo y cierre de turnos con control de diferencias"
        icon={Banknote}
        actions={
          canManage && (
            <Button variant="outline" onClick={openCreate} disabled={branches.length === 0}>
              <Plus /> Nueva caja
            </Button>
          )
        }
      />

      {isError ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} />
        </Card>
      ) : isLoading ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : registers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Banknote}
            title="No hay cajas registradas"
            description="Crea una caja por cada punto de pago de tus sedes."
            action={
              canManage ? (
                <Button onClick={openCreate}>
                  <Plus /> Crear caja
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Tabs defaultValue="turno">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {registers.map((r) => {
                const isOpen = r.sessions.length > 0;
                const active = r.id === selected?.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left transition-colors',
                      active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full', isOpen ? 'bg-success' : 'bg-muted-foreground/40')} />
                    <span>
                      <span className="block text-sm font-medium">{r.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.branch.name} · {isOpen ? 'Abierta' : 'Cerrada'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <TabsList>
              <TabsTrigger value="turno">Turno actual</TabsTrigger>
              <TabsTrigger value="historial">Historial</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="turno" className="mt-6">
            {selected && <SessionPanel key={selected.id} register={selected} />}
          </TabsContent>
          <TabsContent value="historial" className="mt-6">
            <SessionHistory />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva caja</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (form.name.trim() && form.code.trim() && form.branchId) create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cr-name">Nombre</Label>
              <Input id="cr-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-code">Código único</Label>
              <Input id="cr-code" className="uppercase" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Select value={form.branchId} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!form.name.trim() || !form.code.trim() || !form.branchId || create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" />} Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
