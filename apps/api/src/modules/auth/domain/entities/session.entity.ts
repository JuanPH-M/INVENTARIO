export interface SessionEntity {
  userId: string;
  tenantId: string;
  branchId: string | null;
  roles: string[];
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
}
