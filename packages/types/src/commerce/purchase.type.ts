export enum PurchaseOrderStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  CONFIRMED = 'confirmed',
  PARTIAL_RECEIVED = 'partial_received',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

export enum PurchasePaymentStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue',
}

export interface PurchaseOrderItemDto {
  id: string;
  productId: string;
  productName: string;
  productCode: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  taxRate: number;
  discountRate: number;
  subtotal: number;
  location: string | null;
  notes: string | null;
}

export interface PurchaseOrderDto {
  id: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  supplierId: string;
  supplierName: string;
  clientId: string | null;
  clientName: string | null;
  orderNumber: string;
  status: PurchaseOrderStatus;
  currencyId: string;
  currencyCode: string;
  exchangeRate: number;
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  paymentTerms: number | null;
  paymentStatus: PurchasePaymentStatus;
  expectedDate: string | null;
  receivedDate: string | null;
  notes: string | null;
  contractUrl: string | null;
  contractSigned: boolean;
  items: PurchaseOrderItemDto[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}
