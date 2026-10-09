'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, Download, Loader2, ShieldCheck } from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Backup = {
  id: string;
  type: string;
  status: string;
  fileSize: number | null;
  checksum: string | null;
  notes: string | null;
  startedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
};

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  completed: { label: 'Completada', tone: 'success' },
  running: { label: 'En proceso', tone: 'warning' },
  pending: { label: 'Pendiente', tone: 'secondary' },
  failed: { label: 'Fallida', tone: 'destructive' },
};

const size = (bytes: number | null) => {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function BackupsPage() {
  const qc = useQueryClient();
  const can = (p: string) => useAuthStore.getState().user?.permissions.includes(p) ?? false;

  const { data = [], isLoading, isError, error, refetch } = useQuery<Backup[]>({
    queryKey: ['backups'],
    queryFn: async () => (await apiClient.get('/backup')).data.data,
  });

  const create = useMutation({
    mutationFn: async () => (await apiClient.post('/backup/create')).data.data as Backup,
    onSuccess: (b) => {
      toast(
        b.status === 'completed'
          ? { title: 'Copia de seguridad creada', description: b.notes ?? undefined }
          : { variant: 'destructive', title: 'La copia falló', description: b.notes ?? undefined },
      );
      void qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'No se pudo crear la copia', description: getErrorMessage(err) }),
  });

  const download = async (id: string) => {
    try {
      const { data: res } = await apiClient.get(`/backup/${id}/download`);
      window.open(res.data.downloadUrl, '_blank', 'noopener');
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo descargar', description: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Copias de seguridad"
        description="Exporta todos los datos de tu empresa en un archivo comprimido verificable"
        icon={DatabaseBackup}
        actions={
          can('backup:create') && (
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
              {create.isPending ? 'Generando...' : 'Crear copia ahora'}
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="flex gap-3 p-5 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <p>
            La copia incluye productos, existencias, ventas, compras, clientes, caja, finanzas y configuración de la empresa
            (sin contraseñas ni secretos). Cada archivo lleva una huella SHA-256 para verificar su integridad. Las copias
            automáticas nocturnas se activan con <code className="rounded bg-muted px-1">BACKUP_SCHEDULE_ENABLED=true</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden md:table-cell">Contenido</TableHead>
                <TableHead className="text-right">Tamaño</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data.map((b) => {
                    const st = STATUS[b.status] ?? { label: b.status, tone: 'secondary' as const };
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(b.startedAt)}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">{b.type === 'scheduled' ? 'Automática' : 'Manual'}</TableCell>
                        <TableCell>
                          <Badge variant={st.tone}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden max-w-[320px] truncate text-muted-foreground md:table-cell" title={b.checksum ?? undefined}>
                          {b.notes ?? '—'}
                        </TableCell>
                        <TableCell className="tabular text-right">{size(b.fileSize)}</TableCell>
                        <TableCell className="text-right">
                          {b.status === 'completed' && can('backup:download') && (
                            <Button variant="outline" size="xs" onClick={() => download(b.id)}>
                              <Download /> Descargar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        )}
        {!isLoading && !isError && data.length === 0 && (
          <EmptyState icon={DatabaseBackup} title="Aún no hay copias" description="Crea la primera copia de seguridad de tu empresa." />
        )}
      </Card>
    </div>
  );
}
