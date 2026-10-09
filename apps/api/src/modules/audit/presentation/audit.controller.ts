import {
  Controller, Get, Param, ParseUUIDPipe, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { PERMISSIONS } from '@inventario/shared';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import type { JwtPayload } from '@inventario/types';
import type { Prisma } from '@prisma/client';

@ApiTags('Auditoría')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('logs')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Consultar bitácora de auditoría' })
  async getLogs(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('userId') userId?: string,
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('result') result?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, limit);

    const where: Prisma.AuditLogWhereInput = {
      tenantId: user.tenantId,
      ...(userId ? { userId } : {}),
      ...(module ? { module } : {}),
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
      ...(entityId ? { entityId } : {}),
      ...(result ? { result } : {}),
      ...(dateFrom || dateTo
        ? {
            occurredAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: l,
        orderBy: { occurredAt: 'desc' },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(items, total, p, l);
  }

  @Get('entity/:type/:id')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Timeline de auditoría de una entidad específica' })
  async getEntityTimeline(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.prisma.auditLog.findMany({
      where: { tenantId: user.tenantId, entity: type, entityId: id },
      orderBy: { occurredAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
  }

  @Get('user/:userId/activity')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Actividad reciente de un usuario' })
  async getUserActivity(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, 50);
    const where = { tenantId: user.tenantId, userId };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take: l, orderBy: { occurredAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(items, total, p, l);
  }
}
