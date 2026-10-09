import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Tone = 'primary' | 'success' | 'warning' | 'info' | 'destructive';

const tones: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/10 text-info',
  destructive: 'bg-destructive/10 text-destructive',
};

type StatCardProps = {
  title: string;
  value: React.ReactNode;
  icon: React.ElementType;
  hint?: React.ReactNode;
  /** Variación porcentual frente al periodo anterior */
  change?: number | null;
  tone?: Tone;
  isLoading?: boolean;
  /** Cuando subir es negativo (p. ej. gastos), invierte los colores de la variación */
  invertChange?: boolean;
};

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  change,
  tone = 'primary',
  isLoading,
  invertChange,
}: StatCardProps) {
  const hasChange = change !== undefined && change !== null && Number.isFinite(change);
  const positive = (change ?? 0) > 0;
  const good = invertChange ? !positive : positive;
  const ChangeIcon = !hasChange || change === 0 ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        <p className="tabular mt-2 truncate text-[26px] font-semibold leading-tight tracking-tight">{value}</p>
      )}
      <div className="mt-2 flex min-h-[20px] items-center gap-2 text-xs">
        {hasChange && !isLoading && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
              change === 0
                ? 'bg-muted text-muted-foreground'
                : good
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive',
            )}
          >
            <ChangeIcon className="h-3 w-3" />
            {Math.abs(change as number).toFixed(1)}%
          </span>
        )}
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
