'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Search, Warehouse } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient, type PaginatedResponse } from '@/lib/api-client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

type Movement = {
  id: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER';
  quantity: number;
  unitCost?: number;
  notes?: string;
  createdAt: string;
  product: { name: string; sku: string; unit: string };
  user: { firstName: string; lastName: string };
};

const movementSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
  quantity: z.coerce.number().positive('Cantidad debe ser positiva'),
  unitCost: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

type MovementForm = z.infer<typeof movementSchema>;

type ProductOption = { id: string; name: string; sku: string; stock: number; unit: string };

export default function InventoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<PaginatedResponse<Movement>['data']>({
    queryKey: ['inventory-movements', search, page],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/inventory/movements', { params: { search, page, limit: 20 } });
        const p = data.data;
        return { items: Array.isArray(p.data) ? p.data : [], total: p.meta?.total ?? 0, page: p.meta?.page ?? 1, limit: p.meta?.limit ?? 20, totalPages: p.meta?.totalPages ?? 1 };
      } catch {
        return { items: [], total: 0, page: 1, limit: 20, totalPages: 1 };
      }
    },
  });

  const { data: products } = useQuery<ProductOption[]>({
    queryKey: ['products-options'],
    staleTime: 0,
    queryFn: async () => {
      const { data } = await apiClient.get('/products', { params: { limit: 500 } });
      const p = data.data;
      return Array.isArray(p.data) ? p.data : [];
    },
  });

  const form = useForm<MovementForm>({ resolver: zodResolver(movementSchema), defaultValues: { type: 'IN', quantity: 1 } });

  const createMutation = useMutation({
    mutationFn: (body: MovementForm) => apiClient.post('/inventory/movements', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory-movements'] }); setDialogOpen(false); toast({ title: 'Movimiento registrado' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al registrar movimiento' }),
  });

  const typeLabel: Record<string, { label: string; variant: 'success' | 'destructive' | 'secondary'; icon: React.ElementType }> = {
    IN: { label: 'Entrada', variant: 'success', icon: ArrowDown },
    OUT: { label: 'Salida', variant: 'destructive', icon: ArrowUp },
    ADJUSTMENT: { label: 'Ajuste', variant: 'secondary', icon: Warehouse },
    TRANSFER: { label: 'Transferencia', variant: 'secondary', icon: Warehouse },
    adjustment_in: { label: 'Entrada', variant: 'success', icon: ArrowDown },
    adjustment_out: { label: 'Salida', variant: 'destructive', icon: ArrowUp },
    purchase_in: { label: 'Compra', variant: 'success', icon: ArrowDown },
    sale_out: { label: 'Venta', variant: 'destructive', icon: ArrowUp },
    return_in: { label: 'Devolución', variant: 'success', icon: ArrowDown },
    transfer_in: { label: 'Transferencia entrada', variant: 'secondary', icon: Warehouse },
    transfer_out: { label: 'Transferencia salida', variant: 'secondary', icon: Warehouse },
    physical_count: { label: 'Conteo físico', variant: 'secondary', icon: Warehouse },
    damage: { label: 'Daño', variant: 'destructive', icon: ArrowUp },
    theft: { label: 'Robo', variant: 'destructive', icon: ArrowUp },
  };

  const movements = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Inventario</h2>
          <p className="text-muted-foreground text-sm">Movimientos de stock y ajustes</p>
        </div>
        <Button onClick={() => { form.reset({ type: 'IN', quantity: 1 }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> Registrar movimiento
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead>Registrado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(10)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                : movements.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        <Warehouse className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No hay movimientos registrados
                      </TableCell>
                    </TableRow>
                  )
                : movements.map((m) => {
                    const t = typeLabel[m.type] ?? typeLabel['ADJUSTMENT'];
                    const Icon = t.icon;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{m.product.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{m.product.sku}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.variant} className="gap-1">
                            <Icon className="h-3 w-3" />
                            {t.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {typeLabel[m.type]?.variant === 'destructive' ? '-' : '+'}{m.quantity} {m.product.unit}
                        </TableCell>
                        <TableCell className="text-right">{m.unitCost ? formatCurrency(m.unitCost) : '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{m.notes ?? '-'}</TableCell>
                        <TableCell className="text-xs">{m.user.firstName} {m.user.lastName}</TableCell>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar movimiento de inventario</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Producto *</Label>
              <Select onValueChange={(v) => form.setValue('productId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto..." />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku}) — Stock: {p.stock}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.productId && <p className="text-xs text-destructive">{form.formState.errors.productId.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Tipo de movimiento *</Label>
              <Select defaultValue="IN" onValueChange={(v) => form.setValue('type', v as 'IN' | 'OUT' | 'ADJUSTMENT')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Entrada</SelectItem>
                  <SelectItem value="OUT">Salida</SelectItem>
                  <SelectItem value="ADJUSTMENT">Ajuste</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Cantidad *</Label>
                <Input type="number" step="0.01" {...form.register('quantity')} />
                {form.formState.errors.quantity && <p className="text-xs text-destructive">{form.formState.errors.quantity.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Costo unitario</Label>
                <Input type="number" step="0.01" {...form.register('unitCost')} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Input {...form.register('notes')} placeholder="Motivo del movimiento..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>Registrar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
