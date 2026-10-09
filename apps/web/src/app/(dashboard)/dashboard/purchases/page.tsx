'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, Loader2, PackageCheck, Plus, Send, Trash2, Truck, XCircle } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { PURCHASE_STATUS } from '@/lib/labels';
import { round2 } from '@/lib/sale-math';
import { useBranches } from '@/hooks/use-branches';
import { useCatalog } from '@/hooks/use-catalog';
import { useUiStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Combobox } from '@/components/common/combobox';
import { confirm } from '@/components/common/confirm-dialog';
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

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  createdAt: string;
  expectedDate: string | null;
  supplier: { name: string } | null;
  branch: { name: string } | null;
  _count: { items: number };
};

type OrderDetail = OrderRow & {
  subtotal: string;
  taxAmount: string;
  notes: string | null;
  receivedDate: string | null;
  items: Array<{
    id: string;
    productId: string;
    quantityOrdered: string;
    quantityReceived: string;
    unitCost: string;
    taxRate: string;
    subtotal: string;
    product: { name: string; internalCode: string | null };
  }>;
};

type Supplier = { id: string; name: string };
type DraftLine = { productId: string; quantity: string; unitCost: string; taxRate: string };

const emptyLine = (): DraftLine => ({ productId: '', quantity: '1', unitCost: '', taxRate: '0' });

export default function PurchasesPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const branchFilter = useUiStore((s) => s.branchId);
  const { data: branches = [] } = useBranches();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [viewId, setViewId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});

  const can = (p: string) => user?.permissions.includes(p) ?? false;

  const params = { page, limit: 20, status: status === 'all' ? undefined : status, branchId: branchFilter || undefined };
  const { data, isLoading, isError, error, refetch } = useQuery<Paginated<OrderRow>>({
    queryKey: ['purchases', params],
    queryFn: async () => (await apiClient.get('/purchases', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  const { data: detail } = useQuery<OrderDetail>({
    queryKey: ['purchases', 'detail', viewId],
    enabled: !!viewId,
    queryFn: async () => (await apiClient.get(`/purchases/${viewId}`)).data.data,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['purchases'] });
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
  };

  const action = useMutation({
    mutationFn: async ({ id, step, body }: { id: string; step: 'approve' | 'send' | 'receive' | 'cancel'; body?: unknown }) =>
      apiClient.patch(`/purchases/${id}/${step}`, body),
    onSuccess: (_r, vars) => {
      const msg = { approve: 'Orden aprobada', send: 'Orden enviada al proveedor', receive: 'Mercancía recibida e inventario actualizado', cancel: 'Orden cancelada' }[vars.step];
      toast({ title: msg });
      setReceiveQty({});
      refresh();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo completar la acción', description: getErrorMessage(err) }),
  });

  const rows = data?.data ?? [];
  const pendingLines = detail?.items.filter((i) => Number(i.quantityReceived) < Number(i.quantityOrdered)) ?? [];
  const canReceive = detail && ['sent', 'confirmed', 'partial_received'].includes(detail.status) && can('purchases:receive');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compras"
        description="Órdenes de compra a proveedores, aprobación y recepción de mercancía por sede"
        icon={Truck}
        actions={
          can('purchases:create') && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nueva orden
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{data ? `${data.meta.total} órdenes` : ' '}</p>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(PURCHASE_STATUS).map(([v, s]) => (
                <SelectItem key={v} value={v}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orden</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="hidden md:table-cell">Sede destino</TableHead>
                  <TableHead className="hidden lg:table-cell">Entrega</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : rows.map((o) => {
                      const st = PURCHASE_STATUS[o.status] ?? { label: o.status, tone: 'secondary' as const };
                      return (
                        <TableRow key={o.id} className="cursor-pointer" onClick={() => setViewId(o.id)}>
                          <TableCell>
                            <p className="font-medium">{o.orderNumber}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(o.createdAt)} · {o._count.items} ítem(s)</p>
                          </TableCell>
                          <TableCell>{o.supplier?.name}</TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{o.branch?.name}</TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">{o.expectedDate ? formatDate(o.expectedDate) : '—'}</TableCell>
                          <TableCell>
                            <Badge variant={st.tone}>{st.label}</Badge>
                          </TableCell>
                          <TableCell className="tabular text-right font-semibold">{formatCurrency(Number(o.total))}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" aria-label="Ver orden">
                              <Eye />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
            {!isLoading && rows.length === 0 && <EmptyState icon={Truck} title="No hay órdenes de compra" />}
            {(data?.meta.totalPages ?? 0) > 1 && (
              <div className="border-t p-4">
                <Paginator page={page} totalPages={data!.meta.totalPages} total={data!.meta.total} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      {/* Detalle y flujo de la orden */}
      <Dialog open={!!viewId} onOpenChange={(o) => { if (!o) { setViewId(null); setReceiveQty({}); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Orden {detail?.orderNumber}
              {detail && <Badge variant={PURCHASE_STATUS[detail.status]?.tone ?? 'secondary'}>{PURCHASE_STATUS[detail.status]?.label ?? detail.status}</Badge>}
            </DialogTitle>
            <DialogDescription>
              {detail ? `${detail.supplier?.name} → ${detail.branch?.name}` : 'Cargando...'}
            </DialogDescription>
          </DialogHeader>
          {!detail ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Pedido</TableHead>
                      <TableHead className="text-right">Recibido</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      {canReceive && <TableHead className="w-28 text-right">Recibir</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map((i) => {
                      const remaining = round2(Number(i.quantityOrdered) - Number(i.quantityReceived));
                      return (
                        <TableRow key={i.id}>
                          <TableCell>
                            <p className="font-medium">{i.product.name}</p>
                            <p className="text-xs text-muted-foreground">{i.product.internalCode}</p>
                          </TableCell>
                          <TableCell className="tabular text-right">{formatNumber(Number(i.quantityOrdered), 2)}</TableCell>
                          <TableCell className="tabular text-right">{formatNumber(Number(i.quantityReceived), 2)}</TableCell>
                          <TableCell className="tabular text-right">{formatCurrency(Number(i.unitCost))}</TableCell>
                          {canReceive && (
                            <TableCell className="text-right">
                              {remaining > 0 ? (
                                <Input
                                  className="tabular ml-auto h-8 w-24 text-right"
                                  inputMode="decimal"
                                  placeholder={String(remaining)}
                                  value={receiveQty[i.id] ?? ''}
                                  onChange={(e) => setReceiveQty({ ...receiveQty, [i.id]: e.target.value.replace(/[^\d.]/g, '') })}
                                />
                              ) : (
                                <CheckCircle2 className="ml-auto h-4 w-4 text-success" />
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-1 text-sm sm:items-end">
                <p className="text-muted-foreground">
                  Subtotal <span className="tabular ml-4 text-foreground">{formatCurrency(Number(detail.subtotal))}</span>
                </p>
                <p className="text-muted-foreground">
                  Impuestos <span className="tabular ml-4 text-foreground">{formatCurrency(Number(detail.taxAmount))}</span>
                </p>
                <p className="font-semibold">
                  Total <span className="tabular ml-4">{formatCurrency(Number(detail.total))}</span>
                </p>
              </div>
              {detail.notes && <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{detail.notes}</p>}
              <EntityDocuments entity="purchases" id={detail.id} canUpload={can('documents:create')} />
            </div>
          )}
          {detail && (
            <DialogFooter className="flex-wrap gap-2">
              {['draft', 'sent', 'confirmed'].includes(detail.status) && can('purchases:delete') && (
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={async () => {
                    if (await confirm({ title: '¿Cancelar la orden?', description: 'La orden no podrá recibirse después.', destructive: true, confirmText: 'Cancelar orden' }))
                      action.mutate({ id: detail.id, step: 'cancel' });
                  }}
                >
                  <XCircle /> Cancelar orden
                </Button>
              )}
              {detail.status === 'draft' && can('purchases:approve') && (
                <Button variant="outline" onClick={() => action.mutate({ id: detail.id, step: 'approve' })}>
                  <CheckCircle2 /> Aprobar
                </Button>
              )}
              {['draft', 'confirmed'].includes(detail.status) && can('purchases:update') && (
                <Button variant="outline" onClick={() => action.mutate({ id: detail.id, step: 'send' })}>
                  <Send /> Marcar como enviada
                </Button>
              )}
              {canReceive && pendingLines.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setReceiveQty(Object.fromEntries(pendingLines.map((i) => [i.id, String(round2(Number(i.quantityOrdered) - Number(i.quantityReceived)))])))
                    }
                  >
                    Recibir todo
                  </Button>
                  <Button
                    disabled={action.isPending || !Object.values(receiveQty).some((v) => Number(v) > 0)}
                    onClick={() =>
                      action.mutate({
                        id: detail.id,
                        step: 'receive',
                        body: {
                          items: Object.entries(receiveQty)
                            .filter(([, v]) => Number(v) > 0)
                            .map(([purchaseOrderItemId, v]) => ({ purchaseOrderItemId, quantityReceived: Number(v) })),
                        },
                      })
                    }
                  >
                    {action.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
                    Registrar recepción
                  </Button>
                </>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <CreateOrderDialog open={creating} onClose={() => setCreating(false)} branches={branches} onCreated={refresh} />
    </div>
  );
}

function CreateOrderDialog({
  open,
  onClose,
  branches,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  branches: Array<{ id: string; name: string }>;
  onCreated: () => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const { data: catalog = [] } = useCatalog(undefined, open);
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers', 'options'],
    enabled: open,
    queryFn: async () => (await apiClient.get('/suppliers', { params: { limit: 100 } })).data.data?.data ?? [],
  });

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0) * (1 + (Number(l.taxRate) || 0) / 100), 0),
    [lines],
  );

  const reset = () => {
    setSupplierId('');
    setBranchId('');
    setExpectedDate('');
    setNotes('');
    setLines([emptyLine()]);
  };

  const create = useMutation({
    mutationFn: async () =>
      apiClient.post('/purchases', {
        supplierId,
        branchId,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
        items: lines
          .filter((l) => l.productId)
          .map((l) => ({
            productId: l.productId,
            quantityOrdered: Number(l.quantity),
            unitCost: Number(l.unitCost),
            taxRate: (Number(l.taxRate) || 0) / 100,
          })),
      }),
    onSuccess: () => {
      toast({ title: 'Orden de compra creada', description: 'Quedó en borrador para aprobación.' });
      reset();
      onClose();
      onCreated();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo crear la orden', description: getErrorMessage(err) }),
  });

  const valid =
    supplierId && branchId && lines.some((l) => l.productId) && lines.every((l) => !l.productId || (Number(l.quantity) > 0 && Number(l.unitCost) >= 0 && l.unitCost !== ''));

  const update = (idx: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nueva orden de compra</DialogTitle>
          <DialogDescription>La mercancía entrará al inventario de la sede destino cuando se registre la recepción.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Proveedor</Label>
            <Combobox options={suppliers.map((s) => ({ value: s.id, label: s.name }))} value={supplierId} onChange={setSupplierId} placeholder="Selecciona" />
          </div>
          <div className="space-y-2">
            <Label>Sede destino</Label>
            <Select value={branchId} onValueChange={setBranchId}>
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
          <div className="space-y-2">
            <Label htmlFor="po-date">Entrega estimada</Label>
            <Input id="po-date" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="hidden grid-cols-[1fr_90px_130px_80px_36px] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
            <span>Producto</span>
            <span>Cantidad</span>
            <span>Costo unitario</span>
            <span>IVA %</span>
            <span />
          </div>
          {lines.map((l, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_90px_130px_80px_36px]">
              <div className="col-span-2 sm:col-span-1">
                <Combobox
                  options={catalog.map((p) => ({ value: p.id, label: p.name, hint: p.internalCode ?? undefined }))}
                  value={l.productId}
                  onChange={(v) => {
                    const p = catalog.find((c) => c.id === v);
                    update(idx, { productId: v, unitCost: p ? String(p.costPrice) : l.unitCost, taxRate: p ? String(Math.round(p.taxRate * 100)) : l.taxRate });
                  }}
                  placeholder="Producto"
                />
              </div>
              <Input inputMode="decimal" value={l.quantity} onChange={(e) => update(idx, { quantity: e.target.value.replace(/[^\d.]/g, '') })} aria-label="Cantidad" />
              <Input inputMode="decimal" value={l.unitCost} onChange={(e) => update(idx, { unitCost: e.target.value.replace(/[^\d.]/g, '') })} aria-label="Costo" />
              <Input inputMode="decimal" value={l.taxRate} onChange={(e) => update(idx, { taxRate: e.target.value.replace(/[^\d.]/g, '') })} aria-label="IVA" />
              <Button variant="ghost" size="icon" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : [emptyLine()]))} aria-label="Quitar línea">
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus /> Agregar producto
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="po-notes">Notas</Label>
          <Input id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condiciones, referencias de cotización..." />
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <p className="text-sm">
            Total estimado: <span className="tabular font-semibold">{formatCurrency(total)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Crear orden
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
