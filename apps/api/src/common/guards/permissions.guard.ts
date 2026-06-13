import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { CacheService } from '../../cache/cache.service';
import { PrismaService } from '../../database/prisma.service';
import { CACHE_KEYS, CACHE_TTL } from '../../cache/cache-keys.constant';
import type { JwtPayload } from '@inventario/types';
import type { Request } from 'express';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cacheService: CacheService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();

    const user = request.user;
    if (!user) throw new ForbiddenException('No autenticado');

    const branchId = user.branchId ?? null;
    const userPermissions = await this.getUserPermissions(
      user.sub,
      user.tenantId,
      branchId,
    );

    const hasAll = requiredPermissions.every((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasAll) {
      throw new ForbiddenException(
        `Permisos insuficientes. Requeridos: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }

  private async getUserPermissions(
    userId: string,
    tenantId: string,
    branchId: string | null,
  ): Promise<string[]> {
    const cacheKey = CACHE_KEYS.USER_PERMISSIONS(userId, branchId);
    const cached = await this.cacheService.get<string[]>(cacheKey);
    if (cached) return cached;

    const permissions = await this.computePermissions(userId, tenantId, branchId);
    await this.cacheService.set(cacheKey, permissions, CACHE_TTL.PERMISSIONS);
    return permissions;
  }

  private async computePermissions(
    userId: string,
    tenantId: string,
    branchId: string | null,
  ): Promise<string[]> {
    const [userRoles, userOverrides] = await Promise.all([
      this.prisma.userRole.findMany({
        where: {
          userId,
          AND: [
            { OR: [{ branchId }, { branchId: null }] },
            { OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }] },
          ],
        },
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      }),
      this.prisma.userPermission.findMany({
        where: {
          userId,
          AND: [
            { OR: [{ branchId }, { branchId: null }] },
            { OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }] },
          ],
        },
        include: { permission: true },
      }),
    ]);

    const permSet = new Set<string>();

    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permSet.add(rp.permission.slug);
      }
    }

    for (const up of userOverrides) {
      if (up.granted) {
        permSet.add(up.permission.slug);
      } else {
        permSet.delete(up.permission.slug);
      }
    }

    return Array.from(permSet);
  }
}
