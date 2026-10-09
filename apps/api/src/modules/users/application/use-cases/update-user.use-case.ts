import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { CACHE_KEYS } from '../../../../cache/cache-keys.constant';
import { assertAssignableRole, assertBranchOfTenant } from '../role-policy';
import type { UpdateUserDto, AssignRoleDto, RemoveRoleDto, OverridePermissionDto } from '../dtos/user.dto';
import type { JwtPayload } from '@inventario/types';

// Roles that only super_admin can assign

@Injectable()
export class UpdateUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async update(userId: string, tenantId: string, dto: UpdateUserDto) {
    await this.assertUserExists(userId, tenantId);

    // roleId / branchId se gestionan con assignRole/removeRole, no con una actualización directa
    const { password, roleId: _roleId, branchId: _branchId, ...rest } = dto as UpdateUserDto & { password?: string };
    const updateData: Record<string, unknown> = { ...rest };
    if (password) {
      updateData['passwordHash'] = await argon2.hash(password, { type: argon2.argon2id });
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, status: true, updatedAt: true,
      },
    });

    await this.invalidatePermissionsCache(userId);
    return updated;
  }

  async suspend(userId: string, tenantId: string, reason?: string) {
    const user = await this.assertUserExists(userId, tenantId);
    if (user.status === 'suspended') return;

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'suspended' },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.invalidatePermissionsCache(userId);
  }

  async activate(userId: string, tenantId: string) {
    await this.assertUserExists(userId, tenantId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'active', failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.invalidatePermissionsCache(userId);
  }

  async delete(userId: string, tenantId: string, requesterId: string) {
    if (userId === requesterId) {
      throw new ForbiddenException('No puedes eliminar tu propia cuenta');
    }
    await this.assertUserExists(userId, tenantId);

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), status: 'suspended' },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.invalidatePermissionsCache(userId);
  }

  async assignRole(userId: string, tenantId: string, dto: AssignRoleDto, requester: JwtPayload) {
    await this.assertUserExists(userId, tenantId);

    await assertAssignableRole(this.prisma, dto.roleId, tenantId, requester.roles);
    await assertBranchOfTenant(this.prisma, dto.branchId, tenantId);

    const existing = await this.prisma.userRole.findFirst({
      where: { userId, roleId: dto.roleId, branchId: dto.branchId ?? null },
      select: { id: true },
    });
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (existing) {
      await this.prisma.userRole.update({ where: { id: existing.id }, data: { expiresAt } });
    } else {
      await this.prisma.userRole.create({
        data: { userId, roleId: dto.roleId, branchId: dto.branchId ?? null, expiresAt, assignedBy: requester.sub },
      });
    }

    await this.invalidatePermissionsCache(userId);
  }

  async removeRole(userId: string, tenantId: string, dto: RemoveRoleDto) {
    await this.assertUserExists(userId, tenantId);
    await this.prisma.userRole.deleteMany({
      where: { userId, roleId: dto.roleId, branchId: dto.branchId ?? null },
    });
    await this.invalidatePermissionsCache(userId);
  }

  async overridePermission(userId: string, tenantId: string, dto: OverridePermissionDto, requester: JwtPayload) {
    await this.assertUserExists(userId, tenantId);

    const permission = await this.prisma.permission.findUnique({
      where: { slug: dto.permissionSlug },
    });
    if (!permission) throw new NotFoundException('Permiso no encontrado');
    await assertBranchOfTenant(this.prisma, dto.branchId, tenantId);

    // Prevent privilege escalation: requester can only grant permissions they themselves hold,
    // unless they are super_admin
    if (dto.granted && !requester.roles.includes('super_admin')) {
      const requesterPerms = await this.getRequesterPermissions(requester.sub, tenantId, dto.branchId ?? null);
      if (!requesterPerms.includes(dto.permissionSlug)) {
        throw new ForbiddenException('No puedes otorgar un permiso que tú mismo no posees');
      }
    }

    await this.prisma.userPermission.upsert({
      where: {
        userId_permissionId_branchId: {
          userId,
          permissionId: permission.id,
          branchId: dto.branchId ?? (null as unknown as string),
        },
      },
      update: {
        granted: dto.granted,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      create: {
        userId,
        permissionId: permission.id,
        branchId: dto.branchId,
        granted: dto.granted,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    await this.invalidatePermissionsCache(userId);
  }

  private async getRequesterPermissions(userId: string, tenantId: string, branchId: string | null): Promise<string[]> {
    const [userRoles, userOverrides] = await Promise.all([
      this.prisma.userRole.findMany({
        where: {
          userId,
          AND: [
            { OR: [{ branchId }, { branchId: null }] },
            { OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }] },
          ],
        },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
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
      for (const rp of ur.role.rolePermissions) permSet.add(rp.permission.slug);
    }
    for (const up of userOverrides) {
      if (up.granted) permSet.add(up.permission.slug);
      else permSet.delete(up.permission.slug);
    }
    return Array.from(permSet);
  }

  private async assertUserExists(userId: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  private async invalidatePermissionsCache(userId: string): Promise<void> {
    await Promise.all([
      this.cacheService.invalidatePattern(CACHE_KEYS.USER_PERMISSIONS_PATTERN(userId)),
      // Estado cacheado por JwtStrategy: la suspensión surte efecto de inmediato
      this.cacheService.del(`userstate:${userId}`),
    ]);
  }
}
