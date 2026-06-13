export interface StockDto {
  productId: string;
  productName: string;
  productCode: string | null;
  branchId: string;
  branchName: string;
  quantity: number;
  reserved: number;
  available: number;
  location: string | null;
  lastCountedAt: string | null;
}

export interface StockMovementDto {
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  branchId: string;
  branchName: string;
  type: string;
  quantity: number;
  direction: 1 | -1;
  stockBefore: number;
  stockAfter: number;
  unitCost: number | null;
  referenceType: string | null;
  referenceId: string | null;
  fromBranchId: string | null;
  toBranchId: string | null;
  notes: string | null;
  performedBy: string;
  performedByName: string;
  performedAt: string;
}

export interface ProductTimelineEntry {
  id: string;
  type: 'movement' | 'sale' | 'purchase' | 'price_change' | 'info_update' | 'image_added';
  description: string;
  metadata: Record<string, unknown>;
  performedBy: string | null;
  performedByName: string | null;
  occurredAt: string;
}
