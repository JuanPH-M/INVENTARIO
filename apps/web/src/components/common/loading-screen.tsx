import { LogoMark } from '@/components/brand/logo';

export function LoadingScreen({ label = 'Cargando...' }: { label?: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
      <LogoMark className="h-12 w-12 animate-pulse" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
