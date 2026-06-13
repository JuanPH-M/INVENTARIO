export enum CashRegisterStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  SUSPENDED = 'suspended',
}

export enum CashRegisterMovementType {
  OPENING = 'opening',
  SALE = 'sale',
  REFUND = 'refund',
  EXPENSE = 'expense',
  INCOME = 'income',
  WITHDRAWAL = 'withdrawal',
  DEPOSIT = 'deposit',
  CLOSING = 'closing',
}

export interface CashRegisterDto {
  id: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  name: string;
  code: string;
  isActive: boolean;
  currentSessionId: string | null;
  currentStatus: CashRegisterStatus;
  createdAt: string;
}

export interface CashRegisterSessionDto {
  id: string;
  cashRegisterId: string;
  cashRegisterName: string;
  branchId: string;
  openedBy: string;
  openedByName: string;
  closedBy: string | null;
  closedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  expectedClosingAmount: number;
  actualClosingAmount: number | null;
  difference: number | null;
  status: CashRegisterStatus;
  notes: string | null;
  movements: CashRegisterMovementDto[];
}

export interface CashRegisterMovementDto {
  id: string;
  sessionId: string;
  type: CashRegisterMovementType;
  amount: number;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  performedBy: string;
  performedByName: string;
  performedAt: string;
}

export interface CashRegisterReconciliationDto {
  sessionId: string;
  openingAmount: number;
  totalSales: number;
  totalRefunds: number;
  totalIncome: number;
  totalExpenses: number;
  totalWithdrawals: number;
  totalDeposits: number;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
  differencePercent: number;
  isBalanced: boolean;
}
