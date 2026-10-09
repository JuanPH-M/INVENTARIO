'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, History, Loader2, Search, SlidersHorizontal, Warehouse } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import { ADJUSTMENT_TYPES, MOVEMENT_LABELS, label } from '@/lib/labels';
import { useBranches } from '@/hooks/use-branches';
import { useCatalog } from '@/hooks/use-catalog';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Combobox } from '@/components/common/combobox';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Paginator } from '@/components/ui/paginator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type StockRow = {
  productId: string;
  branchId: string;
  quantity: string;
  reserved: string;
  product: { id: string; name: string; internalCode: string | null; minStock: string; reorderPoint?: string; unitOfMeasure: string };
  branch: { name: string };
};

type Movement = {
  id: string;
  type: string;
  quantity: string;
  direction: number;
  stockBefore: string;
  stockAfter: string;
  unitCost: string | null;
  notes: string | null;
  performedAt: string;
  product: { name: string; sku: string };
  branch: { name: string };
  user: { firstName: string; lastName: string };
};

function StockMatrix({ onAdjust, onTransfer }: { onAdjust: (productId: string, branchId: string) => void; onTransfer: (productId: string) => void }) {
  const { data: branches = [] } = useBranches();
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const { data: stock = [], isLoading, isError, error, refetch } = useQuery<StockRow[]>({
    queryKey: ['inventory', 'stock'],
    queryFn: async () => (await apiClient.get('/inventory/stock')).data.data,
  });
  const { data: catalog = [] } = useCatalog();

  const rows = useMemo(() => {
    const byProduct = new Map<string, { id: string; name: string; code: string | null; reorder: number; cells: Map<string, number>; total: number }>();
    for (const p of catalog.filter((c) => c.trackInventory)) {
      byProduct.set(p.id, { id: p.id, name: p.name, code: p.internalCode, reorder: 0, cells: new Map(), total: 0 });
    }
    for (const s of stock) {
      const entry =
        byProduct.get(s.productId) ??
        { id: s.productId, name: s.product.name, code: s.product.internalCode, reorder: 0, cells: new Map<string, number>(), total: 0 };
      const qty = Number(s.quantity);
      entry.cells.set(s.branchId, qty);
      entry.total += qty;
      entry.reorder = Math.max(entry.reorder, Number(s.product.minStock ?? 0));
      byProduct.set(s.productId, entry);
    }
    const q = search.trim().toLowerCase();
    return [...byProduct.values()]
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q))
      .filter((r) => !onlyLow || branches.some((b) => (r.cells.get(b.id) ?? 0) <= r.reorder))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stock, catalog, search, onlyLow, branches]);

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <>
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto o código" className="pl-9" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          Solo stock bajo
        </label>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[220px]">Producto</TableHead>
            {branches.map((b) => (
              <TableHead key={b.id} className="text-right">
                <span className="block max-w-[140px] truncate normal-case" title={b.name}>
                  {b.name}
                </span>
              </TableHead>
            ))}
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={branches.length + 3}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.code ?? '—'}</p>
                  </TableCell>
                  {branches.map((b) => {
                    const qty = r.cells.get(b.id) ?? 0;
                    const low = qty <= r.reorder;
                    return (
                      <TableCell key={b.id} className="text-right">
                        <button
                          onClick={() => onAdjust(r.id, b.id)}
                          title="Ajustar existencias"
                          className={cn(
                            'tabular rounded-md px-2 py-1 font-medium transition-colors hover:bg-muted',
                            qty <= 0 ? 'text-destructive' : low ? 'text-warning' : '',
                          )}
                        >
                          {formatNumber(qty, 2)}
                        </button>
                      </TableCell>
                    );
                  })}
                  <TableCell className="tabular text-right font-semibold">{formatNumber(r.total, 2)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="xs" onClick={() => onTransfer(r.id)} disabled={branches.length < 2}>
                      <ArrowLeftRight /> Trasladar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {!isLoading && rows.length === 0 && <EmptyState icon={Warehouse} title="Sin productos para mostrar" />}
    </>
  );
}

function Movements() {
  const { data: branches = [] } = useBranches();
  const [page, setPage] = useState(1);
  const [branchId, setBranchId] = useState('all');
  const [type, setType] = useState('all');
  const params = { page, limit: 25, branchId: branchId === 'all' ? undefined : branchId, type: type === 'all' ? undefined : type };
  const { data, isLoading, isError, error, refetch } = useQuery<Paginated<Movement>>({
    queryKey: ['inventory', 'movements', params],
    queryFn: async () => (await apiClient.get('/inventory/movements', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  const rows = data?.data ?? [];

  return (
    <>
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
        <Select value={branchId} onValueChange={(v) => { setBranchId(v); setPage(1); }}>
          <SelectTrigger className="sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sedes</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
          <SelectTrigger className="sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los movimientos</SelectItem>
            {['sale_out', 'purchase_in', 'transfer_in', 'transfer_out', 'return_in', ...ADJUSTMENT_TYPES.map((t) => t.value), 'physical_count'].map((t) => (
              <SelectItem key={t} value={t}>
                {label(MOVEMENT_LABELS, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead className="hidden md:table-cell">Sede</TableHead>
            <TableHead>Movimiento</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Saldo</TableHead>
            <TableHead className="hidden xl:table-cell">Responsable</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            : rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(m.performedAt)}</TableCell>
                  <TableCell>
                    <p className="font-medium">{m.product.name}</p>
                    {m.notes && <p className="max-w-[260px] truncate text-xs text-muted-foreground">{m.notes}</p>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{m.branch.name}</TableCell>
                  <TableCell>
                    <Badge variant={m.direction > 0 ? 'success' : 'secondary'}>{label(MOVEMENT_LABELS, m.type)}</Badge>
                  </TableCell>
                  <TableCell className={cn('tabular text-right font-semibold', m.direction > 0 ? 'text-success' : 'text-destructive')}>
                    {m.direction > 0 ? '+' : '−'}
                    {formatNumber(Number(m.quantity), 2)}
                  </TableCell>
                  <TableCell className="tabular hidden text-right text-muted-foreground lg:table-cell">{formatNumber(Number(m.stockAfter), 2)}</TableCell>
                  <TableCell className="hidden text-sm xl:table-cell">
                    {m.user.firstName} {m.user.lastName}
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {!isLoading && rows.length === 0 && <EmptyState icon={History} title="Sin movimientos" />}
      {(data?.meta.totalPages ?? 0) > 1 && (
        <div className="border-t p-4">
          <Paginator page={page} totalPages={data!.meta.totalPages} total={data!.meta.total} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { data: branches = [] } = useBranches();
  const { data: catalog = [] } = useCatalog();
  const canAdjust = user?.permissions.includes('inventory:adjust') ?? false;
  const canTransfer = user?.permissions.includes('inventory:transfer') ?? false;

  const [adjust, setAdjust] = useState<{ productId: string; branchId: string; type: string; quantity: string; notes: string; unitCost: string } | null>(null);
  const [transfer, setTransfer] = useState<{ productId: string; fromBranchId: string; toBranchId: string; quantity: string; notes: string } | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['analytics'] });
  };

  const adjustMutation = useMutation({
    mutationFn: async () =>
      apiClient.post('/inventory/adjust', {
        productId: adjust!.productId,
        branchId: adjust!.branchId,
        type: adjust!.type,
        quantity: Number(adjust!.quantity),
        notes: adjust!.notes,
        unitCost: adjust!.unitCost ? Number(adjust!.unitCost) : undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Existencias actualizadas' });
      setAdjust(null);
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo ajustar', description: getErrorMessage(err) }),
  });

  const transferMutation = useMutation({
    mutationFn: async () => apiClient.post('/inventory/transfer', { ...transfer, quantity: Number(transfer!.quantity) }),
    onSuccess: () => {
      toast({ title: 'Traslado registrado', description: 'Las existencias de ambas sedes se actualizaron.' });
      setTransfer(null);
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo trasladar', description: getErrorMessage(err) }),
  });

  const productOptions = catalog.filter((p) => p.trackInventory).map((p) => ({ value: p.id, label: p.name, hint: p.internalCode ?? undefined }));
  const productName = (id?: string) => catalog.find((p) => p.id === id)?.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Existencias"
        description="Stock de cada sede en tiempo real, kardex de movimientos y traslados entre sedes"
        icon={Warehouse}
        actions={
          <>
            {canTransfer && branches.length > 1 && (
              <Button variant="outline" onClick={() => setTransfer({ productId: '', fromBranchId: '', toBranchId: '', quantity: '', notes: '' })}>
                <ArrowLeftRight /> Traslado
              </Button>
            )}
            {canAdjust && (
              <Button onClick={() => setAdjust({ productId: '', branchId: branches[0]?.id ?? '', type: 'adjustment_in', quantity: '', notes: '', unitCost: '' })}>
                <SlidersHorizontal /> Ajuste
              </Button>
            )}
          </>
        }
      />

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock por sede</TabsTrigger>
          <TabsTrigger value="movements">Kardex de movimientos</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">
          <Card>
            <StockMatrix
              onAdjust={(productId, branchId) =>
                canAdjust && setAdjust({ productId, branchId, type: 'adjustment_in', quantity: '', notes: '', unitCost: '' })
              }
              onTransfer={(productId) =>
                canTransfer && setTransfer({ productId, fromBranchId: '', toBranchId: '', quantity: '', notes: '' })
              }
            />
          </Card>
        </TabsContent>
        <TabsContent value="movements">
          <Card>
            <Movements />
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste de existencias</DialogTitle>
            <DialogDescription>Registra entradas o salidas que no provienen de ventas ni compras. Queda en el kardex y la auditoría.</DialogDescription>
          </DialogHeader>
          {adjust && (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Producto</Label>
                <Combobox options={productOptions} value={adjust.productId} onChange={(v) => setAdjust({ ...adjust, productId: v })} placeholder="Selecciona un producto" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Sede</Label>
                  <Select value={adjust.branchId} onValueChange={(v) => setAdjust({ ...adjust, branchId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sede" />
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
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={adjust.type} onValueChange={(v) => setAdjust({ ...adjust, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADJUSTMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adj-qty">Cantidad</Label>
                  <Input id="adj-qty" inputMode="decimal" value={adjust.quantity} onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value.replace(/[^\d.]/g, '') })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adj-cost">Costo unitario (opcional)</Label>
                  <Input id="adj-cost" inputMode="decimal" value={adjust.unitCost} onChange={(e) => setAdjust({ ...adjust, unitCost: e.target.value.replace(/[^\d.]/g, '') })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adj-notes">Justificación</Label>
                <Input id="adj-notes" value={adjust.notes} onChange={(e) => setAdjust({ ...adjust, notes: e.target.value })} placeholder="Ej. Unidades dañadas en bodega" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAdjust(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!adjust?.productId || !adjust.branchId || !(Number(adjust.quantity) > 0) || adjust.notes.trim().length < 3 || adjustMutation.isPending}
              onClick={() => adjustMutation.mutate()}
            >
              {adjustMutation.isPending && <Loader2 className="animate-spin" />}
              Registrar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!transfer} onOpenChange={(o) => !o && setTransfer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Traslado entre sedes</DialogTitle>
            <DialogDescription>
              {transfer?.productId ? productName(transfer.productId) : 'Mueve mercancía de una sede a otra'} · se registra la salida y la entrada en una sola operación.
            </DialogDescription>
          </DialogHeader>
          {transfer && (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Producto</Label>
                <Combobox options={productOptions} value={transfer.productId} onChange={(v) => setTransfer({ ...transfer, productId: v })} placeholder="Selecciona un producto" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Desde</Label>
                  <Select value={transfer.fromBranchId} onValueChange={(v) => setTransfer({ ...transfer, fromBranchId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sede de origen" />
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
                <div className="space-y-2">
                  <Label>Hacia</Label>
                  <Select value={transfer.toBranchId} onValueChange={(v) => setTransfer({ ...transfer, toBranchId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sede de destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches
                        .filter((b) => b.id !== transfer.fromBranchId)
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="tr-qty">Cantidad</Label>
                  <Input id="tr-qty" inputMode="decimal" value={transfer.quantity} onChange={(e) => setTransfer({ ...transfer, quantity: e.target.value.replace(/[^\d.]/g, '') })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tr-notes">Motivo</Label>
                  <Input id="tr-notes" value={transfer.notes} onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })} placeholder="Ej. Reposición semanal" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTransfer(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !transfer?.productId ||
                !transfer.fromBranchId ||
                !transfer.toBranchId ||
                transfer.fromBranchId === transfer.toBranchId ||
                !(Number(transfer.quantity) > 0) ||
                transfer.notes.trim().length < 3 ||
                transferMutation.isPending
              }
              onClick={() => transferMutation.mutate()}
            >
              {transferMutation.isPending && <Loader2 className="animate-spin" />}
              Trasladar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Haz clic en una cantidad para ajustarla. En naranja: en o por debajo del stock mínimo · en rojo: agotado.
      </p>
    </div>
  );
}
