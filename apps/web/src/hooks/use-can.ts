'use client';

import { useAuthStore } from '@/stores/auth.store';

/** Indica si el usuario actual tiene un permiso (ej. 'products:create'). */
export function useCan(permission: string): boolean {
  return useAuthStore((s) => s.user?.permissions.includes(permission) ?? false);
}
