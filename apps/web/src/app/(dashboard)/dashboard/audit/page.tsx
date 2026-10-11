'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Paginator } from '@/components/ui/paginator';

type AuditLog = {
  id: string;
  module: string;
  action: string;
  entity?: string;
  entityId?: string;
  result: 'success' | 'error' | 'forbidden';
  ipAddress?: string;
  occurredAt: string;
  user?: { firstName: string; lastName: string; email: string };
  changes?: unknown;
};

type AuditResponse = {
  items: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
};

const RESULT_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  success: 'secondary',
  error: 'destructive',
  forbidden: 'destructive',
};

const RESULT_LABEL: Record<string, string> = {
  success: 'OK',
  error: 'Error',
  forbidden: 'Denegado',
};

const ACTION_LABEL: Record<string, string> = {
  create: 'Crear',
  update: 'Actualizar',
  delete: 'Eliminar',
  read: 'Leer',
  login: 'Login',
  logout: 'Logout',
  export: 'Exportar',
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ['audit-logs', page, module, action, result, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (module) params.module = module;
      if (action) params.action = action;
      if (result) params.result = result;
      if (dateFrom) params.dateFrom = new Date(dateFrom).toISOString();
      if (dateTo) params.dateTo = new Date(dateTo + 'T23:59:59').toISOString();
      const { data } = await apiClient.get('/audit/logs', { params });
      return data.data;
    },
  });

  function resetFilters() {
    setModule('');
    setAction('');
    setResult('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const hasFilters = module || action || result || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría"
        description="Quién hizo qué y cuándo: registro inalterable de las acciones realizadas en el sistema"
        icon={ShieldCheck}
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Módulo</label>
              <Input
                placeholder="Ej: products, sales..."
                className="h-8 w-36 text-sm"
                value={module}
                onChange={(e) => { setModule(e.target.value); setPage(1); }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Acción</label>
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm w-32"
                value={action}
                onChange={(e) => { setAction(e.target.value); setPage(1); }}
              >
                <option value="">Todas</option>
                {Object.entries(ACTION_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Resultado</label>
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm w-28"
                value={result}
                onChange={(e) => { setResult(e.target.value); setPage(1); }}
              >
                <option value="">Todos</option>
                <option value="success">OK</option>
                <option value="error">Error</option>
                <option value="forbidden">Denegado</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Desde</label>
              <Input
                type="date"
                className="h-8 text-sm w-36"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Hasta</label>
              <Input
                type="date"
                className="h-8 text-sm w-36"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </div>
            {hasFilters && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground h-8 self-end"
                onClick={resetFilters}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Registros{data ? ` · ${data.total} total` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !data?.items || data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No hay registros para los filtros seleccionados</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Fecha</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Usuario</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Módulo</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Acción</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Entidad</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">Resultado</th>
                      <th className="pb-2 font-medium text-muted-foreground">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((log) => (
                      <>
                        <tr
                          key={log.id}
                          className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        >
                          <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(log.occurredAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-2 pr-4">
                            {log.user
                              ? <span>{log.user.firstName} {log.user.lastName}</span>
                              : <span className="text-muted-foreground text-xs">Sistema</span>
                            }
                          </td>
                          <td className="py-2 pr-4">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">{log.module}</code>
                          </td>
                          <td className="py-2 pr-4">
                            <span className="capitalize">{ACTION_LABEL[log.action] ?? log.action}</span>
                          </td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">
                            {log.entity && <span>{log.entity}{log.entityId ? ` #${log.entityId.slice(0, 8)}` : ''}</span>}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant={RESULT_VARIANT[log.result] ?? 'outline'}>
                              {RESULT_LABEL[log.result] ?? log.result}
                            </Badge>
                          </td>
                          <td className="py-2 text-xs text-muted-foreground">{log.ipAddress}</td>
                        </tr>
                        {expandedId === log.id && log.changes && (
                          <tr key={`${log.id}-detail`} className="bg-muted/20">
                            <td colSpan={7} className="py-2 px-4">
                              <pre className="text-xs overflow-x-auto max-h-40 text-muted-foreground">
                                {JSON.stringify(log.changes, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Paginator
                  page={data.page}
                  totalPages={data.totalPages}
                  total={data.total}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
