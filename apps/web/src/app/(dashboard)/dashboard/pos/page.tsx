'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CreditCard,
  Landmark,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  ReceiptText,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { cn, formatCurrency } from '@/lib/utils';
import { calculateSale, round2 } from '@/lib/sale-math';
import { useCatalog, type CatalogProduct } from '@/hooks/use-catalog';
import { useBranches } from '@/hooks/use-branches';
import { useUiStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/common/combobox';
import { EmptyState } from '@/components/common/empty-state';
import { Receipt, type ReceiptSale } from '@/components/sales/receipt';

type CartLine = { product: CatalogProduct; quantity: number; unitPrice: number; discount: number };
type PaymentMethod = 'cash' | 'card' | 'transfer' | 'credit';
type Register = { id: string; name: string; sessions: Array<{ id: string }> };
type ClientOption = { id: string; firstName?: string | null; lastName?: string | null; businessName?: string | null; idNumber: string };

const METHODS: Array<{ value: PaymentMethod; label: string; icon: React.ElementType }> = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'transfer', label: 'Transferencia', icon: Landmark },
  { value: 'credit', label: 'Crédito', icon: Wallet },
];

const QUICK_CASH = [10_000, 20_000, 50_000, 100_000];

export default function PosPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const globalBranch = useUiStore((s) => s.branchId);
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [received, setReceived] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState('');
  const [receipt, setReceipt] = useState<ReceiptSale | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sede inicial: la del filtro global, o la primera tienda física
  useEffect(() => {
    if (branchId || branches.length === 0) return;
    const preferred = branches.find((b) => b.id === globalBranch) ?? branches.find((b) => b.type !== 'warehouse') ?? branches[0];
    if (preferred) setBranchId(preferred.id);
  }, [branches, branchId, globalBranch]);

  const { data: catalog = [], isLoading: catalogLoading } = useCatalog(branchId, !!branchId);

  const { data: registers = [] } = useQuery<Register[]>({
    queryKey: ['cash-register', 'list', branchId],
    enabled: !!branchId && (user?.permissions.includes('cash_register:read') ?? false),
    queryFn: async () => (await apiClient.get('/cash-register', { params: { branchId } })).data.data,
  });
  const openSessionId = registers.find((r) => r.sessions?.length)?.sessions[0]?.id;

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['clients', 'options'],
    enabled: user?.permissions.includes('clients:read') ?? false,
    staleTime: 60_000,
    queryFn: async () => (await apiClient.get('/clients', { params: { limit: 100 } })).data.data?.data ?? [],
  });

  // Atajos de teclado: F2 buscar, F9 cobrar, Esc limpiar búsqueda
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F9') {
        e.preventDefault();
        document.getElementById('pos-charge')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    catalog.forEach((p) => p.category && map.set(p.category.id, p.category.name));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter(
      (p) =>
        (category === 'all' || p.category?.id === category) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.internalCode?.toLowerCase().includes(q) ||
          p.barcode?.includes(q) ||
          p.sku?.toLowerCase().includes(q)),
    );
  }, [catalog, search, category]);

  const totals = useMemo(
    () =>
      calculateSale(
        cart.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, taxRate: l.product.taxRate, taxIncluded: l.product.taxIncluded })),
        Number(globalDiscount) || 0,
      ),
    [cart, globalDiscount],
  );

  const receivedAmount = method === 'cash' ? Number(received) || 0 : totals.total;
  const change = method === 'cash' ? Math.max(0, round2(receivedAmount - totals.total)) : 0;
  const missing = method === 'cash' ? Math.max(0, round2(totals.total - receivedAmount)) : 0;
  const itemsCount = cart.reduce((s, l) => s + l.quantity, 0);

  const addProduct = (product: CatalogProduct) => {
    setCart((current) => {
      const existing = current.find((l) => l.product.id === product.id);
      const nextQty = (existing?.quantity ?? 0) + 1;
      if (product.trackInventory && nextQty > product.available) {
        toast({ variant: 'destructive', title: 'Sin existencias suficientes', description: `${product.name}: disponibles ${product.available}` });
        return current;
      }
      if (existing) return current.map((l) => (l.product.id === product.id ? { ...l, quantity: nextQty } : l));
      return [...current, { product, quantity: 1, unitPrice: product.salePrice, discount: 0 }];
    });
  };

  const setQty = (productId: string, quantity: number) => {
    setCart((current) =>
      current
        .map((l) => {
          if (l.product.id !== productId) return l;
          const max = l.product.trackInventory ? l.product.available : Infinity;
          return { ...l, quantity: Math.min(Math.max(0, quantity), max) };
        })
        .filter((l) => l.quantity > 0),
    );
  };

  // Lector de código de barras: Enter con un código exacto agrega el producto
  const onSearchEnter = () => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exact = catalog.find((p) => p.barcode === q || p.internalCode?.toLowerCase() === q || p.sku?.toLowerCase() === q);
    const target = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (target) {
      addProduct(target);
      setSearch('');
    }
  };

  const reset = () => {
    setCart([]);
    setClientId('');
    setReceived('');
    setGlobalDiscount('');
    setMethod('cash');
    setSearch('');
    searchRef.current?.focus();
  };

  const charge = useMutation({
    mutationFn: async () => {
      const payments =
        method === 'cash'
          ? [{ type: 'cash', amount: receivedAmount }]
          : [{ type: method, amount: totals.total }];
      const { data } = await apiClient.post('/sales', {
        branchId,
        clientId: clientId || undefined,
        cashRegisterSessionId: openSessionId || undefined,
        globalDiscount: Number(globalDiscount) || undefined,
        items: cart.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount || undefined,
        })),
        payments,
      });
      return data.data as ReceiptSale;
    },
    onSuccess: (sale) => {
      const client = clients.find((c) => c.id === clientId);
      setReceipt({
        ...sale,
        customerName: client ? client.businessName || `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() : null,
      });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: ['sales'] });
      void qc.invalidateQueries({ queryKey: ['cash-register'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo registrar la venta', description: getErrorMessage(err) }),
  });

  const canCharge = cart.length > 0 && !!branchId && totals.total > 0 && missing === 0 && !charge.isPending;
  const branchName = branches.find((b) => b.id === branchId)?.name;

  if (!branchesLoading && branches.length === 0) {
    return <EmptyState icon={ScanBarcode} title="No hay sedes configuradas" description="Crea al menos una sucursal para empezar a vender." />;
  }

  return (
    <div className="-mt-2 grid gap-4 xl:grid-cols-[1fr_400px]">
      {/* ── Catálogo ── */}
      <section className="min-w-0 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()}
              placeholder="Buscar o escanear código de barras (F2)"
              className="h-11 pl-9 text-[15px]"
            />
          </div>
          <Select value={branchId} onValueChange={(v) => { setBranchId(v); setCart([]); }}>
            <SelectTrigger className="h-11 sm:w-64">
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

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[['all', 'Todos'] as [string, string], ...categories].map(([id, name]) => (
            <button
              key={id}
              onClick={() => setCategory(id)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                category === id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
              )}
            >
              {name}
            </button>
          ))}
        </div>

        {catalogLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} title="Sin productos" description="Prueba con otro término de búsqueda o categoría." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => {
              const out = p.trackInventory && p.available <= 0;
              const inCart = cart.find((l) => l.product.id === p.id)?.quantity ?? 0;
              return (
                <button
                  key={p.id}
                  disabled={out}
                  onClick={() => addProduct(p)}
                  className={cn(
                    'surface group relative flex flex-col p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-elevated disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
                    inCart > 0 && 'border-primary ring-2 ring-primary/20',
                  )}
                >
                  {inCart > 0 && (
                    <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                      {inCart}
                    </span>
                  )}
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug">{p.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.internalCode ?? p.sku ?? '—'}</p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <span className="tabular text-[15px] font-semibold">{formatCurrency(p.salePrice)}</span>
                    {p.trackInventory && (
                      <span className={cn('text-xs', p.available <= 5 ? 'font-semibold text-warning' : 'text-muted-foreground')}>
                        {out ? 'Agotado' : `${p.available} und`}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Carrito y cobro ── */}
      <aside id="pos-cart" className="surface flex scroll-mt-20 flex-col xl:sticky xl:top-20 xl:max-h-[calc(100vh-7rem)]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <p className="font-semibold">Venta actual</p>
            {itemsCount > 0 && <Badge>{itemsCount}</Badge>}
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="xs" onClick={reset} className="text-muted-foreground">
              <X /> Vaciar
            </Button>
          )}
        </div>

        <div className="space-y-2 border-b px-4 py-3">
          <Combobox
            options={clients.map((c) => ({
              value: c.id,
              label: c.businessName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
              hint: c.idNumber,
            }))}
            value={clientId}
            onChange={setClientId}
            placeholder="Consumidor final"
            searchPlaceholder="Buscar cliente por nombre o documento"
          />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            {clientId ? (
              <button className="text-primary hover:underline" onClick={() => setClientId('')}>
                Quitar cliente
              </button>
            ) : (
              'Venta sin cliente identificado'
            )}
            <span className="ml-auto flex items-center gap-1">
              <span className={cn('h-1.5 w-1.5 rounded-full', openSessionId ? 'bg-success' : 'bg-muted-foreground')} />
              {openSessionId ? 'Caja abierta' : 'Sin caja abierta'}
            </span>
          </div>
        </div>

        <div className="min-h-[160px] flex-1 overflow-y-auto px-2 py-2">
          {cart.length === 0 ? (
            <EmptyState icon={ReceiptText} title="Agrega productos" description="Haz clic en un producto o escanea su código." className="py-10" />
          ) : (
            cart.map((l) => (
              <div key={l.product.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.product.name}</p>
                  <p className="tabular text-xs text-muted-foreground">{formatCurrency(l.unitPrice)} c/u</p>
                </div>
                <div className="flex items-center rounded-lg border">
                  <button className="p-1.5 hover:bg-muted" onClick={() => setQty(l.product.id, l.quantity - 1)} aria-label="Restar">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    value={l.quantity}
                    onChange={(e) => setQty(l.product.id, Number(e.target.value) || 0)}
                    className="tabular w-9 bg-transparent text-center text-sm outline-none"
                    inputMode="numeric"
                    aria-label="Cantidad"
                  />
                  <button className="p-1.5 hover:bg-muted" onClick={() => setQty(l.product.id, l.quantity + 1)} aria-label="Sumar">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="tabular w-24 text-right text-sm font-semibold">{formatCurrency(l.quantity * l.unitPrice)}</p>
                <button className="p-1 text-muted-foreground hover:text-destructive" onClick={() => setQty(l.product.id, 0)} aria-label="Quitar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3 border-t px-4 py-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Base gravable</span>
              <span className="tabular">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Impuestos</span>
              <span className="tabular">{formatCurrency(totals.tax)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Descuento</span>
              <Input
                value={globalDiscount}
                onChange={(e) => setGlobalDiscount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="0"
                inputMode="decimal"
                className="tabular h-8 w-28 text-right"
              />
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="font-semibold">Total</span>
              <span className="tabular text-2xl font-bold tracking-tight">{formatCurrency(totals.total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-medium transition-colors',
                  method === m.value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                )}
              >
                <m.icon className="h-4 w-4" />
                {m.label}
              </button>
            ))}
          </div>

          {method === 'cash' && (
            <div className="space-y-2">
              <Label htmlFor="received" className="text-xs">
                Efectivo recibido
              </Label>
              <Input
                id="received"
                value={received}
                onChange={(e) => setReceived(e.target.value.replace(/[^\d]/g, ''))}
                placeholder={String(Math.ceil(totals.total))}
                inputMode="numeric"
                className="tabular h-11 text-lg font-semibold"
              />
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="xs" onClick={() => setReceived(String(Math.ceil(totals.total)))}>
                  Exacto
                </Button>
                {QUICK_CASH.map((v) => (
                  <Button key={v} variant="outline" size="xs" onClick={() => setReceived(String(v))}>
                    {formatCurrency(v)}
                  </Button>
                ))}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{missing > 0 ? 'Falta' : 'Cambio'}</span>
                <span className={cn('tabular font-semibold', missing > 0 ? 'text-destructive' : 'text-success')}>
                  {formatCurrency(missing > 0 ? missing : change)}
                </span>
              </div>
            </div>
          )}
          {method === 'credit' && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              La venta quedará con saldo pendiente a nombre del cliente. Selecciona un cliente.
            </p>
          )}

          <Button
            id="pos-charge"
            size="lg"
            className="h-12 w-full text-base"
            disabled={!canCharge || (method === 'credit' && !clientId)}
            onClick={() => charge.mutate()}
          >
            {charge.isPending ? <Loader2 className="animate-spin" /> : <ReceiptText />}
            Cobrar {totals.total > 0 && formatCurrency(totals.total)}
            <kbd className="ml-1 rounded bg-white/20 px-1.5 text-[10px]">F9</kbd>
          </Button>
        </div>
      </aside>

      {/* Acceso rápido al cobro en pantallas pequeñas (el carrito queda debajo del catálogo) */}
      {cart.length > 0 && (
        <button
          onClick={() => document.getElementById('pos-cart')?.scrollIntoView({ behavior: 'smooth' })}
          className="fixed inset-x-4 bottom-9 z-40 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-elevated xl:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <ShoppingCart className="h-4 w-4" /> {itemsCount} producto(s)
          </span>
          <span className="tabular text-base font-bold">{formatCurrency(totals.total)} →</span>
        </button>
      )}

      <Dialog open={!!receipt} onOpenChange={(o) => !o && (setReceipt(null), reset())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Venta registrada</DialogTitle>
          </DialogHeader>
          {receipt && (
            <Receipt
              sale={receipt}
              companyName={user?.tenant?.name}
              branchName={branchName}
              cashier={user ? `${user.firstName} ${user.lastName}` : undefined}
            />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Imprimir
            </Button>
            <Button onClick={() => { setReceipt(null); reset(); }}>
              <ScanBarcode /> Nueva venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
