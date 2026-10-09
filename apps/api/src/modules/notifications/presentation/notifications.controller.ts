import {
  Controller, Get, HttpCode, HttpStatus, Param,
  ParseUUIDPipe, Patch, Query, } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import type { JwtPayload } from '@inventario/types';

@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Mis notificaciones' })
  async getMyNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('status') status?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, 20);
    const where = {
      userId: user.sub,
      tenantId: user.tenantId,
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({ where, skip, take: l, orderBy: { sentAt: 'desc' } }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(items, total, p, l);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Cantidad de notificaciones no leídas' })
  async getUnreadCount(@CurrentUser() user: JwtPayload) {
    const count = await this.prisma.notification.count({
      where: { userId: user.sub, tenantId: user.tenantId, status: 'unread' },
    });
    return { count };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  async markAsRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.sub, tenantId: user.tenantId },
      data: { status: 'read', readAt: new Date() },
    });
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar todas como leídas' })
  async markAllRead(@CurrentUser() user: JwtPayload) {
    await this.prisma.notification.updateMany({
      where: { userId: user.sub, tenantId: user.tenantId, status: 'unread' },
      data: { status: 'read', readAt: new Date() },
    });
  }
}
