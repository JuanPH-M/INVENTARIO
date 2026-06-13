export enum SaleType {
  SALE = 'sale',
  QUOTE = 'quote',
  LAYAWAY = 'layaway',
  CONSIGNMENT = 'consignment',
}

export enum SaleStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  VOIDED = 'voided',
  PARTIAL_RETURN = 'partial_return',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  TRANSFER = 'transfer',
  CHECK = 'check',
  CREDIT = 'credit',
  OTHER = 'other',
}

export interface SaleItemDto {
  id: string;
  productId: string;
  productName: string;
  productCode: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  subtotal: number;
  notes: string | null;
}

export interface PaymentTransactionDto {
  id: string;
  type: PaymentMethod;
  amount: number;
  currency: string;
  reference: string | null;
  status: string;
  processedAt: string;
}

export interface SaleDto {
  id: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  saleNumber: string;
  type: SaleType;
  status: SaleStatus;
  clientId: string | null;
  clientName: string | null;
  customerName: string | null;
  customerIdType: string | null;
  customerIdNum: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  currencyId: string;
  currencyCode: string;
  exchangeRate: number;
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  amountPaid: number;
  changeGiven: number;
  notes: string | null;
  contractUrl: string | null;
  contractSigned: boolean;
  cashRegisterSessionId: string | null;
  items: SaleItemDto[];
  payments: PaymentTransactionDto[];
  soldBy: string;
  soldByName: string;
  createdAt: string;
  updatedAt: string;
}
