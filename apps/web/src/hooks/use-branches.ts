'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

export type BranchOption = {
  id: string;
  name: string;
  code?: string | null;
  type?: string;
  city?: string | null;
  isActive?: boolean;
};

/** Sedes de la empresa (cacheadas 5 min). Solo consulta si el usuario puede verlas. */
export function useBranches() {
  const canRead = useAuthStore((s) => s.user?.permissions.includes('branches:read') ?? false);
  return useQuery<BranchOption[]>({
    queryKey: ['branches', 'options'],
    enabled: canRead,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await apiClient.get('/branches');
      return Array.isArray(data.data) ? data.data : [];
    },
  });
}
