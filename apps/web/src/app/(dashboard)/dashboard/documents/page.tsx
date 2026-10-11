'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileArchive, FileImage, FileSpreadsheet, FileText, FolderOpen, Loader2, Search, Trash2, Upload } from 'lucide-react';
import { apiClient, getErrorMessage, type Paginated } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useCan } from '@/hooks/use-can';
import { useBranches } from '@/hooks/use-branches';
import { toast } from '@/hooks/use-toast';
import { confirm } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Paginator } from '@/components/ui/paginator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Doc = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  fileSize: number;
  mimeType: string;
  referenceType: string | null;
  expiresAt: string | null;
  createdAt: string;
  client: { firstName: string | null; lastName: string | null; businessName: string | null } | null;
  branch: { name: string } | null;
};

const DOC_TYPES: Record<string, string> = {
  invoice: 'Factura',
  contract: 'Contrato',
  receipt: 'Recibo',
  purchase_order: 'Orden de compra',
  warranty: 'Garantía',
  certificate: 'Certificado',
  evidence: 'Evidencia',
  appraisal: 'Tasación',
  id_document: 'Documento de identidad',
  attachment: 'Adjunto',
  other: 'Otro',
};

const REFERENCE: Record<string, string> = { sale: 'Venta', purchase_order: 'Compra', incident: 'Incidencia', asset: 'Activo' };

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip';

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return FileImage;
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return FileSpreadsheet;
  if (mime.includes('zip')) return FileArchive;
  return FileText;
}

function formatSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const canCreate = useCan('documents:create');
  const canDelete = useCan('documents:delete');
  const { data: branches = [] } = useBranches();

  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ type: 'contract', title: '', description: '', branchId: '', expiresAt: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const params = { page, limit: 20, search: debounced.trim() || undefined, type: type === 'all' ? undefined : type };
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Paginated<Doc>>({
    queryKey: ['documents', params],
    queryFn: async () => (await apiClient.get('/documents', { params })).data.data,
    placeholderData: (prev) => prev,
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecciona un archivo');
      const body = new FormData();
      body.append('file', file);
      body.append('type', form.type);
      body.append('title', form.title.trim() || file.name);
      if (form.description.trim()) body.append('description', form.description.trim());
      if (form.branchId) body.append('branchId', form.branchId);
      if (form.expiresAt) body.append('expiresAt', form.expiresAt);
      return apiClient.post('/documents/upload', body, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      toast({ title: 'Documento subido' });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo subir', description: getErrorMessage(err, (err as Error).message) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/documents/${id}`),
    onSuccess: () => {
      toast({ title: 'Documento archivado' });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo eliminar', description: getErrorMessage(err) }),
  });

  const openDoc = async (id: string) => {
    // Se abre la pestaña antes de la petición para que el navegador no la bloquee como popup.
    const win = window.open('', '_blank');
    try {
      const { data } = await apiClient.get(`/documents/${id}/signed-url`);
      if (win) win.location.href = data.data.url;
      else window.location.href = data.data.url;
    } catch (err) {
      win?.close();
      toast({ variant: 'destructive', title: 'No se pudo abrir', description: getErrorMessage(err) });
    }
  };

  const openUpload = () => {
    setFile(null);
    setForm({ type: 'contract', title: '', description: '', branchId: '', expiresAt: '' });
    setOpen(true);
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;
  const filtered = !!(params.search || params.type);
  const now = Date.now();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        description="Contratos, facturas de proveedores, garantías y demás archivos de la empresa en un solo lugar"
        icon={FolderOpen}
        actions={
          canCreate && (
            <Button onClick={openUpload}>
              <Upload /> Subir documento
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por título o descripción"
              className="pl-9"
            />
            {isFetching && !isLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger className="md:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {Object.entries(DOC_TYPES).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !isLoading && rows.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={filtered ? 'Ningún documento coincide' : 'Aún no hay documentos'}
            description={
              filtered
                ? 'Prueba con otra búsqueda o tipo.'
                : 'Sube contratos, garantías o facturas. También puedes adjuntarlos directamente desde una venta o una compra.'
            }
            action={
              !filtered && canCreate ? (
                <Button onClick={openUpload}>
                  <Upload /> Subir documento
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo</TableHead>
                  <TableHead className="hidden lg:table-cell">Asociado a</TableHead>
                  <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody className={cn(isFetching && !isLoading && 'opacity-70 transition-opacity')}>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : rows.map((d) => {
                      const Icon = fileIcon(d.mimeType);
                      const expired = d.expiresAt && new Date(d.expiresAt).getTime() < now;
                      const owner = d.client
                        ? d.client.businessName || `${d.client.firstName ?? ''} ${d.client.lastName ?? ''}`.trim()
                        : d.referenceType
                          ? REFERENCE[d.referenceType] ?? d.referenceType
                          : d.branch?.name;
                      return (
                        <TableRow key={d.id} className="cursor-pointer" onClick={() => openDoc(d.id)}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium">{d.title}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {formatSize(d.fileSize)}
                                  {d.description && ` · ${d.description}`}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="secondary">{DOC_TYPES[d.type] ?? d.type}</Badge>
                            {d.expiresAt && (
                              <p className={cn('mt-1 text-xs', expired ? 'text-destructive' : 'text-muted-foreground')}>
                                {expired ? 'Venció' : 'Vence'} {formatDate(d.expiresAt)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{owner || '—'}</TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatDate(d.createdAt)}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDoc(d.id)} aria-label="Abrir">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  aria-label="Eliminar"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: `¿Eliminar "${d.title}"?`,
                                      description: 'El documento se archivará y dejará de aparecer en la lista.',
                                      destructive: true,
                                      confirmText: 'Eliminar',
                                    });
                                    if (ok) remove.mutate(d.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
            {meta && (
              <div className="border-t px-4 pb-3">
                <Paginator page={meta.page} totalPages={meta.totalPages} total={meta.total} onPageChange={setPage} />
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Subir documento</DialogTitle>
            <DialogDescription>PDF, imágenes, Word, Excel, CSV, TXT o ZIP.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              upload.mutate();
            }}
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) setFile(f);
              }}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-sm transition-colors hover:border-primary/60 hover:bg-primary/5',
                file ? 'border-primary/60 bg-primary/5' : 'border-border',
              )}
            >
              <Upload className="h-6 w-6 text-primary" />
              {file ? (
                <span className="font-medium">
                  {file.name} <span className="font-normal text-muted-foreground">({formatSize(file.size)})</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Haz clic o arrastra un archivo aquí</span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
              }}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOC_TYPES).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-title">Título</Label>
                <Input
                  id="doc-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={file?.name ?? 'Se usa el nombre del archivo'}
                />
              </div>
              {branches.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Sede</Label>
                  <Select value={form.branchId || '__none__'} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === '__none__' ? '' : v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Toda la empresa</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="doc-exp">Vence el (opcional)</Label>
                <Input id="doc-exp" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-desc">Descripción</Label>
              <Input id="doc-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!file || upload.isPending}>
                {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />} Subir
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
