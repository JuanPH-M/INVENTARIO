import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto que se muestra al instante mientras carga cualquier módulo del panel. */
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <Skeleton className="hidden h-10 w-10 rounded-xl sm:block" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72 max-w-[60vw]" />
          </div>
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
