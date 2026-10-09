'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompact, formatCurrency } from '@/lib/utils';
import { PAYMENT_LABELS } from '@/lib/labels';
import { useThemeColors } from '@/hooks/use-theme-colors';

function usePalette() {
  const c = useThemeColors();
  return {
    c,
    series: [c['chart-1'], c['chart-2'], c['chart-3'], c['chart-4'], c['chart-5']],
    axis: { fontSize: 11, fill: c['muted-foreground'] },
  };
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
  formatter?: (value: number, key?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-elevated">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="tabular font-semibold text-foreground">
            {formatter ? formatter(Number(p.value), p.dataKey) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export function RevenueTrendChart({ data }: { data: Array<{ date: string; revenue: number; transactions: number }> }) {
  const { c, axis } = usePalette();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c['chart-1']} stopOpacity={0.35} />
            <stop offset="100%" stopColor={c['chart-1']} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.border} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v: number) => formatCompact(v)} tick={axis} axisLine={false} tickLine={false} width={48} />
        <Tooltip
          content={
            <ChartTooltip formatter={(v, key) => (key === 'revenue' ? formatCurrency(v) : String(v))} />
          }
          labelFormatter={(l: string) => shortDate(l)}
        />
        <Area
          type="monotone"
          isAnimationActive={false}
          dataKey="revenue"
          name="Ingresos"
          stroke={c['chart-1']}
          strokeWidth={2.2}
          fill="url(#revenueFill)"
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BranchBarChart({ data }: { data: Array<{ name: string; revenue: number; transactions: number }> }) {
  const { c, series, axis } = usePalette();
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 52)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={c.border} />
        <XAxis type="number" tickFormatter={(v: number) => formatCompact(v)} tick={axis} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ ...axis, fill: c.foreground }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: c.muted, opacity: 0.6 }}
          content={<ChartTooltip formatter={(v, key) => (key === 'revenue' ? formatCurrency(v) : String(v))} />}
        />
        <Bar isAnimationActive={false} dataKey="revenue" name="Ingresos" radius={[0, 6, 6, 0]} maxBarSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={series[i % series.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PaymentMixChart({ data }: { data: Array<{ type: string; amount: number }> }) {
  const { series } = usePalette();
  const total = data.reduce((s, d) => s + d.amount, 0);
  const rows = data.map((d) => ({ ...d, name: PAYMENT_LABELS[d.type] ?? d.type }));
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie isAnimationActive={false} data={rows} dataKey="amount" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2} strokeWidth={0}>
              {rows.map((_, i) => (
                <Cell key={i} fill={series[i % series.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-muted-foreground">Total</span>
          <span className="tabular text-sm font-semibold">{formatCompact(total)}</span>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.type} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: series[i % series.length] }} />
            <span className="flex-1 text-muted-foreground">{r.name}</span>
            <span className="tabular font-medium">{total ? Math.round((r.amount / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
