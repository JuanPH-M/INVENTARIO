'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Loader2, Paperclip, Upload } from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DOC_TYPES: Record<string, string> = {
  invoice: 'Factura',
  contract: 'Contrato',
  receipt: 'Recibo',
  warranty: 'Garantía',
  certificate: 'Certificado',
  evidence: 'Evidencia',
  appraisal: 'Tasación',
  attachment: 'Adjunto',
  other: 'Otro',
};

type Doc = { id: string; title: string; type: string; fileSize: number | null; createdAt: string };

/**
 * Documentos adjuntos a una venta u orden de compra (facturas del proveedor, contratos,
 * garantías...). Se guardan en el almacenamiento configurado y se abren con URL firmada.
 */
export function EntityDocuments({ entity, id, canUpload }: { entity: 'sales' | 'purchases'; id: string; canUpload: boolean }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState('invoice');
  const [title, setTitle] = useState('');
  const key = [entity, 'documents', id];

  const { data: docs = [], isLoading } = useQuery<Doc[]>({
    queryKey: key,
    queryFn: async () => (await apiClient.get(`/${entity}/${id}/documents`)).data.data,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('type', type);
      form.append('title', title.trim() || file.name);
      return apiClient.post(`/${entity}/${id}/documents`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      toast({ title: 'Documento adjuntado' });
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo adjuntar', description: getErrorMessage(err) }),
  });

  const open = async (docId: string) => {
    try {
      const { data } = await apiClient.get(`/documents/${docId}/signed-url`);
      window.open(data.data.url, '_blank', 'noopener');
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo abrir', description: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-3" data-no-print>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Paperclip className="h-4 w-4 text-muted-foreground" /> Documentos adjuntos
      </p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando...</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin documentos.</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.id}>
              <button onClick={() => open(d.id)} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/50">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {DOC_TYPES[d.type] ?? d.type} · {formatDate(d.createdAt)}
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-[130px_1fr_auto]">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9">
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
          <Input className="h-9" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
            onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
          />
          <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />} Adjuntar
          </Button>
        </div>
      )}
    </div>
  );
}
