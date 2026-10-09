'use client';

import { useEffect, useState } from 'react';

const TOKENS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'border', 'muted-foreground', 'foreground', 'muted'] as const;
type Token = (typeof TOKENS)[number];

function read(): Record<Token, string> {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    TOKENS.map((t) => [t, `hsl(${style.getPropertyValue(`--${t}`).trim() || '0 0% 50%'})`]),
  ) as Record<Token, string>;
}

/**
 * Colores del tema resueltos a valores reales. Los atributos de SVG (fill, stroke) no
 * entienden var(--...), así que las gráficas necesitan el color ya calculado.
 * Se actualiza automáticamente al cambiar entre tema claro y oscuro.
 */
export function useThemeColors(): Record<Token, string> {
  const [colors, setColors] = useState<Record<Token, string>>(() =>
    typeof window === 'undefined'
      ? (Object.fromEntries(TOKENS.map((t) => [t, '#6366f1'])) as Record<Token, string>)
      : read(),
  );

  useEffect(() => {
    setColors(read());
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return colors;
}
