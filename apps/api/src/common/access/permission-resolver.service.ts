import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../cache/cache-keys.constant';

/**
 * Fuente única de verdad para los permisos efectivos de un usuario.
 * La usan tanto PermissionsGuard (para autorizar) como GET /auth/me (para el menú),
 * así la interfaz nunca muestra opciones que el backend luego rechaza.
 *
 * Permisos efectivos = permisos de los roles vigentes (globales + de la sucursal)
 *                      ± excepciones por usuario (granted / revoked).
 */
@Injectable()
export class PermissionResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getPermissions(userId: string, branchId: string | null = null): Promise<string[]> {
    const cacheKey = CACHE_KEYS.USER_PERMISSIONS(userId, branchId);
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const permissions = await this.compute(userId, branchId);
    await this.cache.set(cacheKey, permissions, CACHE_TTL.PERMISSIONS);
    return permissions;
  }

  async invalidate(userId: string): Promise<void> {
    await this.cache.invalidatePattern(CACHE_KEYS.USER_PERMISSIONS_PATTERN(userId));
  }

  private async compute(userId: string, branchId: string | null): Promise<string[]> {
    const now = new Date();
    const scope = branchId
      ? { OR: [{ branchId }, { branchId: null }] }
      : {};
    const notExpired = { OR: [{ expiresAt: { gt: now } }, { expiresAt: null }] };

    const [userRoles, overrides] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { userId, AND: [scope, notExpired] },
        select: {
          role: {
            select: { rolePermissions: { select: { permission: { select: { slug: true } } } } },
          },
        },
      }),
      this.prisma.userPermission.findMany({
        where: { userId, AND: [scope, notExpired] },
        select: { granted: true, permission: { select: { slug: true } } },
      }),
    ]);

    const set = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) set.add(rp.permission.slug);
    }
    for (const o of overrides) {
      if (o.granted) set.add(o.permission.slug);
      else set.delete(o.permission.slug);
    }
    return Array.from(set).sort();
  }
}
