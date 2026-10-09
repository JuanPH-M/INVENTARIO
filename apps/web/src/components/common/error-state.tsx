'use client';

import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

type ErrorStateProps = {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
};

/** Error de carga con opción de reintentar (en lugar de mostrar listas vacías o ceros). */
export function ErrorState({ error, title = 'No se pudo cargar la información', onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {getErrorMessage(error, 'Revisa tu conexión e inténtalo de nuevo.')}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RotateCw /> Reintentar
        </Button>
      )}
    </div>
  );
}
