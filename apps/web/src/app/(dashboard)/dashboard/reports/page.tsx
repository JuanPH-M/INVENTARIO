'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Download, Loader2, RefreshCw, FileText,
  Calendar, CalendarDays, CalendarRange, History,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GeneratedReport {
  id: string;
  type: string;
  title: string;
  periodType: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  fileSize: number;
  generatedAt: string;
  downloadUrl: string;
  metadata: Record<string, unknown>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const reportTypes = [
  { value: 'sales',     label: 'Ventas',      description: 'Detalle de todas las ventas en el período' },
  { value: 'inventory', label: 'Inventario',  description: 'Movimientos de stock por producto' },
  { value: 'purchases', label: 'Compras',     description: 'Órdenes de compra y recepción' },
  { value: 'finance',   label: 'Finanzas',    description: 'Ingresos, gastos y balance' },
  { value: 'clients',   label: 'Clientes',    description: 'Ranking y comportamiento de clientes' },
  { value: 'products',  label: 'Productos',   description: 'Catálogo y precios de productos' },
];

const periods = [
  { value: 'daily',   label: 'Diario',   icon: Calendar },
  { value: 'weekly',  label: 'Semanal',  icon: CalendarDays },
  { value: 'monthly', label: 'Mensual',  icon: CalendarRange },
  { value: 'annual',  label: 'Anual',    icon: FileText },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function weekRange() {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - day);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { from: mon.toISOString().split('T')[0], to: sun.toISOString().split('T')[0] };
}

function monthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] };
}

function yearRange() {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function periodBadgeColor(p: string | null) {
  const map: Record<string, string> = {
    daily: 'bg-blue-100 text-blue-800',
    weekly: 'bg-purple-100 text-purple-800',
    monthly: 'bg-green-100 text-green-800',
    annual: 'bg-orange-100 text-orange-800',
  };
  return map[p ?? ''] ?? 'bg-gray-100 text-gray-700';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const qc = useQueryClient();

  // On-demand tab state
  const [reportType, setReportType] = useState('sales');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [format, setFormat]         = useState('pdf');

  // Auto-generate tab state
  const [genPeriod, setGenPeriod]   = useState('monthly');
  const [genType, setGenType]       = useState('sales');

  // History filters
  const [histType, setHistType]     = useState('');
  const [histPeriod, setHistPeriod] = useState('');

  // ── On-demand download ────────────────────────────────────────────────────
  const downloadMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.get(`/reports/${reportType}`, {
        params: { from: dateFrom, to: dateTo, format },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([data]));
      const a   = document.createElement('a');
      a.href    = url;
      a.download = `reporte-${reportType}-${dateFrom}-${dateTo}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast({ title: 'Reporte descargado' }),
    onError:   () => toast({ variant: 'destructive', title: 'Error al generar reporte' }),
  });

  // ── Period shortcut helpers ───────────────────────────────────────────────
  const applyToday = () => { setDateFrom(todayStr()); setDateTo(todayStr()); };
  const applyWeek  = () => { const r = weekRange();  setDateFrom(r.from); setDateTo(r.to); };
  const applyMonth = () => { const r = monthRange(); setDateFrom(r.from); setDateTo(r.to); };
  const applyYear  = () => { const r = yearRange();  setDateFrom(r.from); setDateTo(r.to); };

  // ── Periodic generation ───────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/reports/generate/${genPeriod}`, null, {
        params: { type: genType },
      });
      return data.data as { id: string; title: string; downloadUrl: string; rowCount: number };
    },
    onSuccess: (result) => {
      toast({ title: 'Reporte generado', description: result.title });
      qc.invalidateQueries({ queryKey: ['reports-history'] });
    },
    onError: () => toast({ variant: 'destructive', title: 'Error al generar reporte' }),
  });

  // ── History ───────────────────────────────────────────────────────────────
  const historyQuery = useQuery<{ data: GeneratedReport[]; meta: { total: number } }>({
    queryKey: ['reports-history', histType, histPeriod],
    queryFn: async () => {
      const { data } = await apiClient.get('/reports', {
        params: {
          ...(histType   ? { type: histType }         : {}),
          ...(histPeriod ? { periodType: histPeriod } : {}),
          limit: 50,
        },
      });
      return data.data;
    },
  });

  const history: GeneratedReport[] = historyQuery.data?.data ?? [];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Reportes</h2>
        <p className="text-muted-foreground text-sm">Genera, almacena y descarga reportes del negocio</p>
      </div>

      <Tabs defaultValue="ondemand">
        <TabsList>
          <TabsTrigger value="ondemand">Generar ahora</TabsTrigger>
          <TabsTrigger value="periodic">Guardar período</TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <History className="h-3.5 w-3.5" />
            Historial
          </TabsTrigger>
        </TabsList>

        {/* ── On-demand tab ── */}
        <TabsContent value="ondemand" className="space-y-4 pt-2">
          {/* Report type cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reportTypes.map((rt) => (
              <Card
                key={rt.value}
                className={`cursor-pointer transition-all ${reportType === rt.value ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`}
                onClick={() => setReportType(rt.value)}
              >
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary shrink-0" />
                    {rt.label}
                  </CardTitle>
                  <CardDescription className="text-xs">{rt.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          {/* Config card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurar reporte</CardTitle>
              <CardDescription>
                Tipo: <strong>{reportTypes.find((r) => r.value === reportType)?.label}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Period shortcuts */}
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground self-center">Atajo:</span>
                <Button variant="outline" size="sm" onClick={applyToday}>Hoy</Button>
                <Button variant="outline" size="sm" onClick={applyWeek}>Esta semana</Button>
                <Button variant="outline" size="sm" onClick={applyMonth}>Este mes</Button>
                <Button variant="outline" size="sm" onClick={applyYear}>Este año</Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Fecha desde</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Fecha hasta</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Formato</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                disabled={!dateFrom || !dateTo || downloadMutation.isPending}
                onClick={() => downloadMutation.mutate()}
              >
                {downloadMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generando...</>
                  : <><Download className="h-4 w-4 mr-1" /> Generar y descargar</>}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Periodic save tab ── */}
        <TabsContent value="periodic" className="space-y-4 pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generar y guardar reporte periódico</CardTitle>
              <CardDescription>El PDF se almacena y queda disponible en el historial para descarga futura</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Period selector */}
              <div className="space-y-2">
                <Label>Período</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {periods.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setGenPeriod(value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-all ${
                        genPeriod === value ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Report type */}
              <div className="space-y-1">
                <Label>Tipo de reporte</Label>
                <Select value={genType} onValueChange={setGenType}>
                  <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {reportTypes.map((rt) => (
                      <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generando...</>
                  : <><FileText className="h-4 w-4 mr-1" /> Generar reporte {periods.find((p) => p.value === genPeriod)?.label.toLowerCase()}</>}
              </Button>

              {generateMutation.isSuccess && generateMutation.data && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                  <FileText className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800 truncate">{generateMutation.data.title}</p>
                    <p className="text-xs text-green-600">{generateMutation.data.rowCount} registros</p>
                  </div>
                  <a href={generateMutation.data.downloadUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5" /></Button>
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── History tab ── */}
        <TabsContent value="history" className="space-y-4 pt-2">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={histType || 'all'} onValueChange={(v) => setHistType(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {reportTypes.map((rt) => (
                    <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Select value={histPeriod || 'all'} onValueChange={(v) => setHistPeriod(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ['reports-history'] })}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* List */}
          {historyQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No hay reportes almacenados aún. Genera uno desde la pestaña <strong>Guardar período</strong>.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {history.map((r) => (
                <Card key={r.id} className="overflow-hidden">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {r.periodType && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${periodBadgeColor(r.periodType)}`}>
                            {periods.find((p) => p.value === r.periodType)?.label ?? r.periodType}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.generatedAt).toLocaleString('es-CO')}
                        </span>
                        {r.fileSize > 0 && (
                          <span className="text-xs text-muted-foreground">{formatBytes(r.fileSize)}</span>
                        )}
                      </div>
                    </div>
                    <a href={r.downloadUrl} target="_blank" rel="noreferrer" download>
                      <Button size="sm" variant="outline" className="shrink-0">
                        <Download className="h-3.5 w-3.5 mr-1" />
                        PDF
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
