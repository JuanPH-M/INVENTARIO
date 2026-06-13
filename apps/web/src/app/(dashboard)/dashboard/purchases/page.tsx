'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, FileText, Plus, Search, Truck, Upload, X, CheckCircle2, ExternalLink } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';

type PurchaseDocument = {
  id: string;
  type: string;
  title: string;
  description?: string;
  fileUrl: string;
  mimeType: string;
  fileSize?: number;
  createdAt: string;
};

type Purchase = {
  id: string;
  purchaseNumber: string;
  status: 'PENDING' | 'RECEIVED' | 'CANCELLED' | 'PARTIAL';
  total: number;
  expectedDate?: string;
  createdAt: string;
  contractUrl?: string;
  contractSigned?: boolean;
  supplier?: { name: string };
  items: { product: { name: string }; quantity: number; unitCost: number }[];
};

const purchaseSchema = z.object({
  supplierId: z.string().optional(),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().positive(),
    unitCost: z.coerce.number().positive(),
  })).min(1),
});

type PurchaseForm = z.infer<typeof purchaseSchema>;

type SupplierOption = { id: string; name: string };
type ProductOption = { id: string; name: string; sku: string; cost: number };

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  RECEIVED: { label: 'Recibida', variant: 'success' },
  PENDING: { label: 'Pendiente', variant: 'warning' },
  PARTIAL: { label: 'Parcial', variant: 'secondary' },
  CANCELLED: { label: 'Cancelada', variant: 'destructive' },
};

const docTypeLabels: Record<string, string> = {
  contract: 'Contrato',
  invoice: 'Factura',
  purchase_order: 'Orden de compra',
  evidence: 'Evidencia',
  receipt: 'Recibo',
  certificate: 'Certificado',
  attachment: 'Adjunto',
  other: 'Otro',
};

function formatFileSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PurchaseDocumentPanel({ purchaseId, contractSigned }: { purchaseId: string; contractSigned?: boolean }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('contract');
  const [docTitle, setDocTitle] = useState('');
  const [docDesc, setDocDesc] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerMime, setViewerMime] = useState<string>('');

  const { data: docs, isLoading } = useQuery<PurchaseDocument[]>({
    queryKey: ['purchase-docs', purchaseId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/purchases/${purchaseId}/documents`);
      return Array.isArray(data.data) ? data.data : data.data ?? [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !docTitle) throw new Error('Completa los campos');
      const form = new FormData();
      form.append('file', selectedFile);
      form.append('type', docType);
      form.append('title', docTitle);
      if (docDesc) form.append('description', docDesc);
      await apiClient.post(`/purchases/${purchaseId}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-docs', purchaseId] });
      setSelectedFile(null);
      setDocTitle('');
      setDocDesc('');
      if (fileRef.current) fileRef.current.value = '';
      toast({ title: 'Documento adjuntado correctamente' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error al adjuntar', description: e?.response?.data?.message ?? '' }),
  });

  const signMutation = useMutation({
    mutationFn: () => apiClient.patch(`/purchases/${purchaseId}/contract-signed`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      toast({ title: 'Contrato marcado como firmado' });
    },
  });

  const openDocument = async (docId: string) => {
    try {
      const { data } = await apiClient.get(`/documents/${docId}/signed-url`);
      const info = data.data ?? data;
      setViewerMime(info.mimeType ?? '');
      setViewerUrl(info.url);
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo obtener el documento' });
    }
  };

  return (
    <div className="space-y-4">
      {viewerUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b">
              <span className="text-sm font-medium">Visualizador de documento</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => window.open(viewerUrl, '_blank')}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir en nueva pestaña
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setViewerUrl(null)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {viewerMime.startsWith('image/') ? (
                <img src={viewerUrl} alt="Documento" className="w-full h-full object-contain p-4" />
              ) : (
                <iframe src={viewerUrl} className="w-full h-full border-0" title="Documento" />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Documentos adjuntos</h4>
          {!contractSigned ? (
            <Button size="sm" variant="outline" onClick={() => signMutation.mutate()} disabled={signMutation.isPending}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Marcar contrato firmado
            </Button>
          ) : (
            <Badge variant="success" className="text-xs">Contrato firmado</Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !docs || docs.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg">
            <FileText className="h-6 w-6 mx-auto mb-1 opacity-40" />
            Sin documentos adjuntos
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {docTypeLabels[doc.type] ?? doc.type} · {formatDateTime(doc.createdAt)}
                    {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => openDocument(doc.id)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Adjuntar nuevo documento</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(docTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Título *</Label>
            <Input className="h-8 text-xs" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Ej: Contrato proveedor XYZ" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Descripción (opcional)</Label>
          <Input className="h-8 text-xs" value={docDesc} onChange={(e) => setDocDesc(e.target.value)} placeholder="Observaciones..." />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Archivo (PDF, imagen, documento)</Label>
          <div
            className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                <span className="font-medium truncate max-w-[200px]">{selectedFile.name}</span>
                <button className="text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="text-muted-foreground text-xs">
                <Upload className="h-5 w-5 mx-auto mb-1" />
                Haz clic para seleccionar archivo
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!selectedFile || !docTitle || uploadMutation.isPending}
          onClick={() => uploadMutation.mutate()}
        >
          <Upload className="h-3.5 w-3.5 mr-1" />
          {uploadMutation.isPending ? 'Subiendo...' : 'Adjuntar documento'}
        </Button>
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Purchase>['data']>({
    queryKey: ['purchases', search, page],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get('/purchases', { params: { search, page, limit: 15 } });
        const p = data.data;
        return { items: Array.isArray(p.data) ? p.data : [], total: p.meta?.total ?? 0, page: p.meta?.page ?? 1, limit: p.meta?.limit ?? 15, totalPages: p.meta?.totalPages ?? 1 };
      } catch {
        return { items: [], total: 0, page: 1, limit: 15, totalPages: 1 };
      }
    },
  });

  const { data: suppliers } = useQuery<SupplierOption[]>({
    queryKey: ['suppliers-options'],
    staleTime: 0,
    queryFn: async () => {
      const { data } = await apiClient.get('/suppliers', { params: { limit: 200 } });
      const p = data.data;
      return Array.isArray(p.data) ? p.data : [];
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

  const form = useForm<PurchaseForm>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: { items: [{ productId: '', quantity: 1, unitCost: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: (body: PurchaseForm) => apiClient.post('/purchases', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchases'] }); setDialogOpen(false); toast({ title: 'Orden de compra creada' }); },
    onError: () => toast({ variant: 'destructive', title: 'Error al crear orden de compra' }),
  });

  const total = form.watch('items').reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const purchases = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Compras</h2>
          <p className="text-muted-foreground text-sm">Órdenes de compra a proveedores</p>
        </div>
        <Button onClick={() => { form.reset({ items: [{ productId: '', quantity: 1, unitCost: 0 }] }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> Nueva orden
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por número o proveedor..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Fecha esperada</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(8)].map((_, i) => <TableRow key={i}>{[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>)
                : purchases.length === 0
                ? <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground"><Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />No hay órdenes de compra</TableCell></TableRow>
                : purchases.map((p) => {
                    const st = statusConfig[p.status] ?? { label: p.status, variant: 'secondary' as const };
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.purchaseNumber}</TableCell>
                        <TableCell>{p.supplier?.name ?? 'Sin proveedor'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.expectedDate ? new Date(p.expectedDate).toLocaleDateString('es-CO') : '-'}</TableCell>
                        <TableCell className="text-center"><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(p.total)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewPurchase(p)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva orden de compra</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Proveedor</Label>
                <Select onValueChange={(v) => form.setValue('supplierId', v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar proveedor..." /></SelectTrigger>
                  <SelectContent>{(suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Fecha esperada de llegada</Label>
                <Input type="date" {...form.register('expectedDate')} />
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Productos *</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: '', quantity: 1, unitCost: 0 })}>
                  <Plus className="h-3 w-3" /> Agregar
                </Button>
              </div>
              {fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6 space-y-1">
                    {i === 0 && <Label className="text-xs">Producto</Label>}
                    <Select onValueChange={(v) => {
                      form.setValue(`items.${i}.productId`, v);
                      const p = products?.find((p) => p.id === v);
                      if (p) form.setValue(`items.${i}.unitCost`, p.cost);
                    }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>{(products ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Cantidad</Label>}
                    <Input type="number" step="0.01" className="h-9" {...form.register(`items.${i}.quantity`)} />
                  </div>
                  <div className="col-span-3 space-y-1">
                    {i === 0 && <Label className="text-xs">Costo unit.</Label>}
                    <Input type="number" step="0.01" className="h-9" {...form.register(`items.${i}.unitCost`)} />
                  </div>
                  <div className="col-span-1">
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => remove(i)} disabled={fields.length === 1}>×</Button>
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex justify-end">
              <div className="text-right space-y-1">
                <p className="text-muted-foreground text-sm">Total de la orden</p>
                <p className="text-2xl font-bold">{formatCurrency(total)}</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Input {...form.register('notes')} placeholder="Observaciones..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>Crear orden</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Ver detalle con documentos */}
      <Dialog open={!!viewPurchase} onOpenChange={(o) => !o && setViewPurchase(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Orden {viewPurchase?.purchaseNumber}
              {viewPurchase?.contractSigned && <Badge variant="success" className="text-xs">Contrato firmado</Badge>}
            </DialogTitle>
          </DialogHeader>
          {viewPurchase && (
            <Tabs defaultValue="detail">
              <TabsList className="w-full">
                <TabsTrigger value="detail" className="flex-1">Detalle</TabsTrigger>
                <TabsTrigger value="documents" className="flex-1">
                  <FileText className="h-3.5 w-3.5 mr-1" /> Documentos y Contratos
                </TabsTrigger>
              </TabsList>

              <TabsContent value="detail" className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Proveedor: </span>{viewPurchase.supplier?.name ?? 'N/A'}</div>
                  <div><span className="text-muted-foreground">Fecha: </span>{formatDateTime(viewPurchase.createdAt)}</div>
                  <div><span className="text-muted-foreground">Fecha esperada: </span>{viewPurchase.expectedDate ? new Date(viewPurchase.expectedDate).toLocaleDateString('es-CO') : 'N/A'}</div>
                  <div><span className="text-muted-foreground">Estado: </span><Badge variant={statusConfig[viewPurchase.status]?.variant ?? 'secondary'}>{statusConfig[viewPurchase.status]?.label ?? viewPurchase.status}</Badge></div>
                </div>
                <Separator />
                <div className="space-y-2">
                  {viewPurchase.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{item.product.name} × {item.quantity}</span>
                      <span>{formatCurrency(item.unitCost * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-sm">
                  <span>Total</span>
                  <span>{formatCurrency(viewPurchase.total)}</span>
                </div>
              </TabsContent>

              <TabsContent value="documents" className="pt-2">
                <PurchaseDocumentPanel purchaseId={viewPurchase.id} contractSigned={viewPurchase.contractSigned} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
