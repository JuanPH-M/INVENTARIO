import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { parsePaginationParams, paginate } from '../../../../common/utils/pagination.util';
import type { GetUsersQueryDto } from '../dtos/user.dto';
import type { PaginatedResponse } from '@inventario/types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class GetUsersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    tenantId: string,
    query: GetUsersQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    const { page, limit, skip } = parsePaginationParams(query.page, query.limit);

    const where: Prisma.UserWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.branchId || query.roleSlug
        ? {
            userRoles: {
              some: {
                ...(query.branchId ? { branchId: query.branchId } : {}),
                ...(query.roleSlug ? { role: { slug: query.roleSlug } } : {}),
              },
            },
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatarUrl: true,
          status: true,
          mfaEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          userRoles: {
            select: {
              roleId: true,
              branchId: true,
              role: { select: { id: true, name: true, slug: true } },
              branch: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(users, total, page, limit);
  }

  async getById(userId: string, tenantId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        status: true,
        mfaEnabled: true,
        lastLoginAt: true,
        lastLoginIp: true,
        language: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          select: {
            roleId: true,
            branchId: true,
            role: { select: { id: true, name: true, slug: true } },
            branch: { select: { id: true, name: true } },
          },
        },
        userPermissions: {
          select: {
            permissionId: true,
            permission: { select: { slug: true, name: true } },
            branch: { select: { name: true } },
          },
        },
      },
    });
  }
}
