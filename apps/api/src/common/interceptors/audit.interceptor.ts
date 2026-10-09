import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';
import { SKIP_AUDIT_KEY } from '../decorators/skip-audit.decorator';
import type { JwtPayload } from '@inventario/types';
import type { Request } from 'express';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_FIELDS = new Set([
  'password', 'passwordHash', 'newPassword', 'currentPassword', 'mfaSecret', 'mfaBackupCodes',
  'token', 'refreshToken', 'mfaToken',
]);

function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeData);
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : sanitizeData(val);
  }
  return result;
}

function extractEntityInfo(url: string): { module: string; entity: string; entityId?: string } {
  const parts = url.replace('/api/', '').split('/').filter(Boolean);
  const module = parts[0] ?? 'unknown';
  const entity = parts[0] ?? 'unknown';
  const entityId = parts[1] && !parts[1].startsWith('?') ? parts[1] : undefined;
  return { module, entity, entityId };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();

    if (!MUTATION_METHODS.has(request.method)) return next.handle();

    const user = request.user;
    const { module, entity, entityId } = extractEntityInfo(request.url);
    const method = request.method;
    const action = method === 'POST' ? 'CREATE' : method === 'PUT' || method === 'PATCH' ? 'UPDATE' : 'DELETE';
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.writeLog({
          tenantId: user?.tenantId ?? null,
          userId: user?.sub ?? null,
          userEmail: null,
          action,
          module,
          entity,
          entityId: entityId ?? null,
          changes: sanitizeData(request.body) as Record<string, unknown>,
          metadata: { method, url: request.url, durationMs: Date.now() - startTime },
          ipAddress: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
          result: 'success',
        });
      }),
      catchError((err: Error) => {
        this.writeLog({
          tenantId: user?.tenantId ?? null,
          userId: user?.sub ?? null,
          userEmail: null,
          action,
          module,
          entity,
          entityId: entityId ?? null,
          changes: null,
          metadata: { method, url: request.url },
          ipAddress: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
          result: 'failure',
          errorMessage: err.message,
        });
        return throwError(() => err);
      }),
    );
  }

  private writeLog(data: {
    tenantId: string | null;
    userId: string | null;
    userEmail: string | null;
    action: string;
    module: string;
    entity: string;
    entityId: string | null;
    changes: unknown;
    metadata: Record<string, unknown>;
    ipAddress: string | null;
    userAgent: string | null;
    result: string;
    errorMessage?: string;
  }): void {
    this.prisma.auditLog
      .create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          userEmail: data.userEmail,
          action: data.action,
          module: data.module,
          entity: data.entity,
          entityId: data.entityId,
          changes: data.changes as object,
          metadata: data.metadata as object,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          result: data.result,
          errorMessage: data.errorMessage,
        },
      })
      .catch((err: unknown) => this.logger.error('AuditLog write failed', err));
  }
}
