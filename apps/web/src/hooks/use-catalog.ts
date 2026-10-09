'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type CatalogProduct = {
  id: string;
  name: string;
  internalCode: string | null;
  barcode: string | null;
  sku: string | null;
  brand: string | null;
  salePrice: number;
  costPrice: number;
  minSalePrice: number;
  taxRate: number;
  taxIncluded: boolean;
  trackInventory: boolean;
  unitOfMeasure: string;
  imageUrl: string | null;
  category: { id: string; name: string } | null;
  /** Unidades disponibles (stock − reservado) en la sede consultada o en todas */
  available: number;
};

/** Catálogo completo de productos activos con disponibilidad (por sede si se indica). */
export function useCatalog(branchId?: string, enabled = true) {
  return useQuery<CatalogProduct[]>({
    queryKey: ['products', 'catalog', branchId ?? 'all'],
    enabled,
    staleTime: 30_000,
    queryFn: async () => (await apiClient.get('/products/catalog', { params: { branchId: branchId || undefined } })).data.data,
  });
}
