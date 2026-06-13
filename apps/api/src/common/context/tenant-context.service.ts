import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  userId: string;
  branchId: string | null;
  roles: string[];
  sessionId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, fn: () => T): T {
    return this.storage.run(context, fn) as T;
  }

  get(): TenantContext | undefined {
    return this.storage.getStore();
  }

  getTenantId(): string {
    const ctx = this.get();
    if (!ctx) throw new Error('TenantContext not initialized');
    return ctx.tenantId;
  }

  getUserId(): string {
    const ctx = this.get();
    if (!ctx) throw new Error('TenantContext not initialized');
    return ctx.userId;
  }

  getBranchId(): string | null {
    return this.get()?.branchId ?? null;
  }

  getRoles(): string[] {
    return this.get()?.roles ?? [];
  }
}
