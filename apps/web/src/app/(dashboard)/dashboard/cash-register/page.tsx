'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, DollarSign, Lock, Unlock, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';

type CashRegister = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  branch: { name: string };
  sessions: {
    id: string;
    status: string;
    openingAmount: number;
    openedAt: string;
    openedBy: { firstName: string; lastName: string };
  }[];
};

type Session = {
  id: string;
  status: string;
  openingAmount: number;
  expectedClosingAmount: number;
  openedAt: string;
  openedBy: { firstName: string; lastName: string };
  movements: { id: string; type: string; amount: number; description: string; performedAt: string }[];
};

const createRegisterSchema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  code: z.string().min(1, 'Código requerido'),
  branchId: z.string().uuid('Selecciona una sucursal'),
});
const openSchema = z.object({ openingAmount: z.coerce.number().min(0, 'Monto no puede ser negativo') });
const closeSchema = z.object({
  actualAmount: z.coerce.number().min(0, 'Monto no puede ser negativo'),
  notes: z.string().optional(),
});
const movementSchema = z.object({
  type: z.enum(['income', 'expense', 'withdrawal', 'deposit']),
  amount: z.coerce.number().positive('Monto debe ser mayor que cero'),
  description: z.string().min(1, 'La descripción es requerida'),
});

type Branch = { id: string; name: string };

export default function CashRegisterPage() {
  const qc = useQueryClient();
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>('');
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [txDialog, setTxDialog] = useState(false);
  const [createDialog, setCreateDialog] = useState(false);

  const { data: registers, isLoading: loadingRegisters } = useQuery<CashRegister[]>({
    queryKey: ['cash-registers'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/cash-register');
        return Array.isArray(data.data) ? data.data : [];
      } catch {
        return [];
      }
    },
  });

  const activeRegister = registers?.find(r => r.id === selectedRegisterId) ?? registers?.[0];
  const registerId = activeRegister?.id;
  const openSessionFromList = activeRegister?.sessions?.[0];

  const { data: session, isLoading: loadingSession } = useQuery<Session | null>({
    queryKey: ['cash-session', registerId],
    enabled: !!registerId,
    queryFn: async () => {
      try {
        const { data } = await apiClient.get(`/cash-register/${registerId}/session/current`);
        return data.data ?? null;
      } catch {
        return null;
      }
    },
  });

  const { data: branches } = useQuery<Branch[]>({
    queryKey: ['branches-cash'],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/branches');
        return Array.isArray(data.data) ? data.data : [];
      } catch { return []; }
    },
  });

  const createRegisterForm = useForm<z.infer<typeof createRegisterSchema>>({ resolver: zodResolver(createRegisterSchema) });
  const branchIdVal = createRegisterForm.watch('branchId');

  const createRegisterMutation = useMutation({
    mutationFn: (body: z.infer<typeof createRegisterSchema>) => apiClient.post('/cash-register', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-registers'] });
      setCreateDialog(false);
      toast({ title: 'Caja creada correctamente' });
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast({ variant: 'destructive', title: e.response?.data?.message ?? 'Error al crear caja' }),
  });

  const openForm = useForm({ resolver: zodResolver(openSchema), defaultValues: { openingAmount: 0 } });
  const closeForm = useForm({ resolver: zodResolver(closeSchema), defaultValues: { actualAmount: 0, notes: '' } });
  type MovementForm = { type: 'income' | 'expense' | 'withdrawal' | 'deposit'; amount: number; description: string };
  const txForm = useForm<MovementForm>({
    resolver: zodResolver(movementSchema),
    defaultValues: { type: 'income', amount: 0, description: '' },
  });
  const txTypeVal = txForm.watch('type');

  const openMutation = useMutation({
    mutationFn: (body: { openingAmount: number }) =>
      apiClient.post('/cash-register/sessions/open', {
        cashRegisterId: registerId,
        openingAmount: body.openingAmount,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-registers'] });
      qc.invalidateQueries({ queryKey: ['cash-session', registerId] });
      setOpenDialog(false);
      toast({ title: 'Caja abierta correctamente' });
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast({ variant: 'destructive', title: e.response?.data?.message ?? 'Error al abrir la caja' }),
  });

  const closeMutation = useMutation({
    mutationFn: (body: { actualAmount: number; notes?: string }) =>
      apiClient.post(`/cash-register/sessions/${session?.id}/close`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-registers'] });
      qc.invalidateQueries({ queryKey: ['cash-session', registerId] });
      setCloseDialog(false);
      toast({ title: 'Caja cerrada correctamente' });
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast({ variant: 'destructive', title: e.response?.data?.message ?? 'Error al cerrar la caja' }),
  });

  const txMutation = useMutation({
    mutationFn: (body: { type: string; amount: number; description: string }) =>
      apiClient.post(`/cash-register/sessions/${session?.id}/movements`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-session', registerId] });
      setTxDialog(false);
      toast({ title: 'Movimiento registrado' });
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast({ variant: 'destructive', title: e.response?.data?.message ?? 'Error al registrar movimiento' }),
  });

  const isOpen = !!session && session.status === 'open';
  const movements = session?.movements ?? [];
  const totalIncome = movements.filter(m => ['income', 'deposit', 'sale'].includes(m.type)).reduce((s, m) => s + Number(m.amount), 0);
  const totalExpense = movements.filter(m => ['expense', 'withdrawal'].includes(m.type)).reduce((s, m) => s + Number(m.amount), 0);

  if (loadingRegisters) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }


  if (!registers || registers.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Caja Registradora</h2>
            <p className="text-muted-foreground text-sm">Control de apertura, cierre y movimientos de caja</p>
          </div>
          <Button onClick={() => { createRegisterForm.reset(); setCreateDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nueva caja
          </Button>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <CreditCard className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No hay cajas registradoras configuradas.</p>
            <Button onClick={() => { createRegisterForm.reset(); setCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Crear primera caja
            </Button>
          </CardContent>
        </Card>
        <Dialog open={createDialog} onOpenChange={setCreateDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Nueva caja registradora</DialogTitle></DialogHeader>
            <form onSubmit={createRegisterForm.handleSubmit((d) => createRegisterMutation.mutate(d))} className="space-y-4">
              <div className="space-y-1">
                <Label>Nombre *</Label>
                <Input {...createRegisterForm.register('name')} placeholder="Ej: Caja Principal" />
                {createRegisterForm.formState.errors.name && <p className="text-xs text-destructive">{createRegisterForm.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Código *</Label>
                <Input {...createRegisterForm.register('code')} placeholder="Ej: CAJA-01" />
                {createRegisterForm.formState.errors.code && <p className="text-xs text-destructive">{createRegisterForm.formState.errors.code.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Sucursal *</Label>
                <Select value={branchIdVal ?? ''} onValueChange={(v) => createRegisterForm.setValue('branchId', v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar sucursal" /></SelectTrigger>
                  <SelectContent>
                    {(branches ?? []).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {createRegisterForm.formState.errors.branchId && <p className="text-xs text-destructive">{createRegisterForm.formState.errors.branchId.message}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialog(false)}>Cancelar</Button>
                <Button type="submit" disabled={createRegisterMutation.isPending}>{createRegisterMutation.isPending ? 'Creando…' : 'Crear caja'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Caja Registradora</h2>
          <p className="text-muted-foreground text-sm">Control de apertura, cierre y movimientos de caja</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { createRegisterForm.reset(); setCreateDialog(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nueva caja
          </Button>
          {registers.length > 1 && (
            <Select value={selectedRegisterId || activeRegister?.id || ''} onValueChange={setSelectedRegisterId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Seleccionar caja" />
              </SelectTrigger>
              <SelectContent>
                {registers.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name} — {r.branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!loadingSession && (
            <>
              {!isOpen ? (
                <Button onClick={() => { openForm.reset({ openingAmount: 0 }); setOpenDialog(true); }}>
                  <Unlock className="h-4 w-4 mr-1" /> Abrir caja
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => { txForm.reset({ type: 'income', amount: 0, description: '' }); setTxDialog(true); }}>
                    <DollarSign className="h-4 w-4 mr-1" /> Movimiento
                  </Button>
                  <Button variant="destructive" onClick={() => { closeForm.reset({ actualAmount: Number(session?.expectedClosingAmount ?? 0), notes: '' }); setCloseDialog(true); }}>
                    <Lock className="h-4 w-4 mr-1" /> Cerrar caja
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Estado</CardDescription>
            <CardTitle className="text-2xl">
              <Badge variant={isOpen ? 'success' : 'secondary'} className="text-base px-3 py-1">
                {isOpen ? 'Abierta' : 'Cerrada'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {activeRegister?.name} — {activeRegister?.branch.name}
            </p>
            {isOpen && session?.openedBy && (
              <p className="text-xs text-muted-foreground">
                Abierta por {session.openedBy.firstName} {session.openedBy.lastName}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monto de apertura</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(Number(session?.openingAmount ?? 0))}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Ingresos: {formatCurrency(totalIncome)} · Egresos: {formatCurrency(totalExpense)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saldo esperado</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(Number(session?.expectedClosingAmount ?? 0))}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{movements.length} movimientos en esta sesión</p>
          </CardContent>
        </Card>
      </div>

      {isOpen && movements.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Movimientos de esta sesión</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => {
                  const isPositive = ['income', 'deposit', 'sale'].includes(m.type);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Badge variant={isPositive ? 'success' : 'destructive'}>{m.type}</Badge>
                      </TableCell>
                      <TableCell>{m.description}</TableCell>
                      <TableCell className={`text-right font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : '-'}{formatCurrency(Number(m.amount))}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(m.performedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Abrir caja */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Abrir caja</DialogTitle></DialogHeader>
          <form onSubmit={openForm.handleSubmit((d) => openMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Monto de apertura</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" {...openForm.register('openingAmount')} />
              {openForm.formState.errors.openingAmount && (
                <p className="text-xs text-destructive">{openForm.formState.errors.openingAmount.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={openMutation.isPending}>
                {openMutation.isPending ? 'Abriendo…' : 'Abrir caja'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cerrar caja */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cerrar caja</DialogTitle></DialogHeader>
          <form onSubmit={closeForm.handleSubmit((d) => closeMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Monto real en caja</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" {...closeForm.register('actualAmount')} />
              {closeForm.formState.errors.actualAmount && (
                <p className="text-xs text-destructive">{closeForm.formState.errors.actualAmount.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Input {...closeForm.register('notes')} placeholder="Observaciones opcionales" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloseDialog(false)}>Cancelar</Button>
              <Button type="submit" variant="destructive" disabled={closeMutation.isPending}>
                {closeMutation.isPending ? 'Cerrando…' : 'Cerrar caja'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Movimiento */}
      <Dialog open={txDialog} onOpenChange={setTxDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nuevo movimiento</DialogTitle></DialogHeader>
          <form onSubmit={txForm.handleSubmit((d) => txMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select
                value={txTypeVal}
                onValueChange={(v) => txForm.setValue('type', v as MovementForm['type'], { shouldValidate: true })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Ingreso</SelectItem>
                  <SelectItem value="expense">Gasto</SelectItem>
                  <SelectItem value="withdrawal">Retiro</SelectItem>
                  <SelectItem value="deposit">Depósito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Monto</Label>
              <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...txForm.register('amount')} />
              {txForm.formState.errors.amount && (
                <p className="text-xs text-destructive">{txForm.formState.errors.amount.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Descripción *</Label>
              <Input {...txForm.register('description')} placeholder="Motivo del movimiento" />
              {txForm.formState.errors.description && (
                <p className="text-xs text-destructive">{txForm.formState.errors.description.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTxDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={txMutation.isPending}>
                {txMutation.isPending ? 'Guardando…' : 'Registrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nueva caja */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nueva caja registradora</DialogTitle></DialogHeader>
          <form onSubmit={createRegisterForm.handleSubmit((d) => createRegisterMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input {...createRegisterForm.register('name')} placeholder="Ej: Caja Principal" />
              {createRegisterForm.formState.errors.name && <p className="text-xs text-destructive">{createRegisterForm.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Código *</Label>
              <Input {...createRegisterForm.register('code')} placeholder="Ej: CAJA-01" />
              {createRegisterForm.formState.errors.code && <p className="text-xs text-destructive">{createRegisterForm.formState.errors.code.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Sucursal *</Label>
              <Select value={branchIdVal ?? ''} onValueChange={(v) => createRegisterForm.setValue('branchId', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar sucursal" /></SelectTrigger>
                <SelectContent>
                  {(branches ?? []).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {createRegisterForm.formState.errors.branchId && <p className="text-xs text-destructive">{createRegisterForm.formState.errors.branchId.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={createRegisterMutation.isPending}>{createRegisterMutation.isPending ? 'Creando…' : 'Crear caja'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
