'use client';

import { useEffect, useState } from 'react';

/** Retrasa la actualización de un valor (útil para búsquedas que consultan la API). */
export function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
