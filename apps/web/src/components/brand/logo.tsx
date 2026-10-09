import { cn } from '@/lib/utils';
import { BRAND } from '@/config/brand';

/** Isotipo: cubo apilado que representa inventario organizado. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn('h-8 w-8', className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M16 6.5 25 11v10l-9 4.5L7 21V11l9-4.5Z" fill="white" fillOpacity="0.18" />
      <path d="M16 6.5 25 11l-9 4.5L7 11l9-4.5Z" fill="white" />
      <path d="M16 15.5v10L7 21V11l9 4.5Z" fill="white" fillOpacity="0.72" />
      <path d="M16 15.5 25 11v10l-9 4.5v-10Z" fill="white" fillOpacity="0.45" />
    </svg>
  );
}

export function Logo({ className, collapsed = false, inverted = false }: { className?: string; collapsed?: boolean; inverted?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="h-8 w-8 shrink-0" />
      {!collapsed && (
        <span className={cn('text-[15px] font-semibold tracking-tight', inverted ? 'text-white' : 'text-foreground')}>
          {BRAND.name.split(' ')[0]}
          <span className="text-primary"> {BRAND.name.split(' ').slice(1).join(' ')}</span>
        </span>
      )}
    </span>
  );
}
