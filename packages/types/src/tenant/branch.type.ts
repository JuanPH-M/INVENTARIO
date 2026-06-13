export enum BranchType {
  PHYSICAL = 'physical',
  ONLINE = 'online',
  WAREHOUSE = 'warehouse',
  POPUP = 'popup',
}

export interface BranchDto {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  type: BranchType;
  address: Record<string, string> | null;
  phone: string | null;
  email: string | null;
  managerId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
