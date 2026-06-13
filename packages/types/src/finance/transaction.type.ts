export enum FinancialAccountType {
  ASSET = 'asset',
  LIABILITY = 'liability',
  EQUITY = 'equity',
  INCOME = 'income',
  EXPENSE = 'expense',
}

export interface FinancialAccountDto {
  id: string;
  tenantId: string;
  branchId: string | null;
  parentId: string | null;
  code: string | null;
  name: string;
  type: FinancialAccountType;
  balance: number;
  currency: string;
  isActive: boolean;
}

export interface FinancialTransactionDto {
  id: string;
  tenantId: string;
  branchId: string | null;
  type: string;
  description: string;
  amount: number;
  currency: string;
  referenceType: string | null;
  referenceId: string | null;
  transactionDate: string;
  createdBy: string | null;
  createdAt: string;
}

export interface ProfitLossDto {
  periodStart: string;
  periodEnd: string;
  totalRevenue: number;
  totalExpenses: number;
  grossProfit: number;
  grossMargin: number;
  currency: string;
}
