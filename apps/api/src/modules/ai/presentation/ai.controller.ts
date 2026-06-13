import {
  Body, Controller, Get, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { PERMISSIONS } from '@inventario/shared';
import type { JwtPayload } from '@inventario/types';

class ChatMessageDto {
  @ApiProperty() @IsString() @IsNotEmpty() message!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() conversationId?: string;
}

@ApiTags('Inteligencia Artificial')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('predictions/stock')
  @RequirePermissions(PERMISSIONS.AI_PREDICTIONS)
  @ApiOperation({ summary: 'Predicciones de agotamiento de stock' })
  async getStockPredictions(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
  ) {
    return this.prisma.aiPrediction.findMany({
      where: {
        tenantId: user.tenantId,
        type: 'stock_depletion',
        isActive: true,
        validUntil: { gte: new Date() },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { confidence: 'desc' },
      take: 20,
    });
  }

  @Get('insights')
  @RequirePermissions(PERMISSIONS.AI_READ)
  @ApiOperation({ summary: 'Insights automáticos del negocio' })
  async getInsights(@CurrentUser() user: JwtPayload) {
    const [lowStock, openIncidents, upcomingRenewals, maintenanceDue] = await Promise.all([
      this.prisma.inventoryStock.count({
        where: {
          tenantId: user.tenantId,
          product: { trackInventory: true, deletedAt: null },
        },
      }).then(async () => {
        const stocks = await this.prisma.inventoryStock.findMany({
          where: { tenantId: user.tenantId },
          include: { product: { select: { minStock: true, reorderPoint: true } } },
        });
        return stocks.filter((s) => Number(s.quantity) <= Number(s.product.reorderPoint)).length;
      }),
      this.prisma.incident.count({
        where: { tenantId: user.tenantId, status: { in: ['open', 'in_progress'] } },
      }),
      this.prisma.clientSubscription.count({
        where: {
          tenantId: user.tenantId,
          status: 'active',
          renewalDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.asset.count({
        where: {
          tenantId: user.tenantId,
          status: 'active',
          nextMaintenance: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const insights = [];

    if (lowStock > 0) {
      insights.push({
        type: 'warning',
        category: 'inventory',
        title: 'Stock bajo en productos',
        description: `${lowStock} producto(s) están bajo el punto de reorden`,
        priority: lowStock > 10 ? 'high' : 'medium',
        actionUrl: '/inventory?filter=low_stock',
      });
    }

    if (openIncidents > 0) {
      insights.push({
        type: 'info',
        category: 'operations',
        title: 'Incidencias abiertas',
        description: `${openIncidents} incidencia(s) sin resolver`,
        priority: 'medium',
        actionUrl: '/incidents?status=open',
      });
    }

    if (upcomingRenewals > 0) {
      insights.push({
        type: 'warning',
        category: 'subscriptions',
        title: 'Renovaciones próximas',
        description: `${upcomingRenewals} suscripción(es) vencen en los próximos 30 días`,
        priority: 'medium',
        actionUrl: '/subscriptions',
      });
    }

    if (maintenanceDue > 0) {
      insights.push({
        type: 'warning',
        category: 'assets',
        title: 'Mantenimientos pendientes',
        description: `${maintenanceDue} activo(s) requieren mantenimiento esta semana`,
        priority: 'high',
        actionUrl: '/assets?filter=maintenance_due',
      });
    }

    return { insights, generatedAt: new Date() };
  }

  @Post('chat')
  @RequirePermissions(PERMISSIONS.AI_CHAT)
  @ApiOperation({ summary: 'Asistente conversacional' })
  async chat(
    @Body() dto: ChatMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    let conversation;
    if (dto.conversationId) {
      conversation = await this.prisma.aiConversation.findFirst({
        where: { id: dto.conversationId, tenantId: user.tenantId, userId: user.sub },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
      });
    }

    if (!conversation) {
      conversation = await this.prisma.aiConversation.create({
        data: {
          tenantId: user.tenantId,
          userId: user.sub,
          title: dto.message.substring(0, 50),
        },
        include: { messages: true },
      });
    }

    await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: dto.message,
      },
    });

    const response = await this.generateAiResponse(dto.message, user.tenantId);

    const aiMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: response,
        tokensUsed: response.length,
      },
    });

    return {
      conversationId: conversation.id,
      message: response,
      messageId: aiMessage.id,
    };
  }

  @Get('conversations')
  @RequirePermissions(PERMISSIONS.AI_CHAT)
  @ApiOperation({ summary: 'Listar conversaciones del usuario' })
  async getConversations(@CurrentUser() user: JwtPayload) {
    return this.prisma.aiConversation.findMany({
      where: { tenantId: user.tenantId, userId: user.sub },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { _count: { select: { messages: true } } },
    });
  }

  private async generateAiResponse(message: string, tenantId: string): Promise<string> {
    const lower = message.toLowerCase();

    if (lower.includes('ventas') || lower.includes('venta')) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const stats = await this.prisma.sale.aggregate({
        where: { tenantId, status: 'completed', createdAt: { gte: today } },
        _sum: { total: true },
        _count: { id: true },
      });
      return `Hoy se han registrado ${stats._count.id} ventas por un total de $${Number(stats._sum.total ?? 0).toLocaleString('es-CO')} COP.`;
    }

    if (lower.includes('stock') || lower.includes('inventario')) {
      const stocks = await this.prisma.inventoryStock.findMany({ where: { tenantId }, include: { product: { select: { minStock: true, reorderPoint: true } } } });
      const low = stocks.filter((s) => Number(s.quantity) <= Number(s.product.reorderPoint)).length;
      return `Actualmente hay ${low} producto(s) bajo el punto de reorden. Te recomiendo revisar el módulo de inventario para más detalles.`;
    }

    if (lower.includes('suscripcion') || lower.includes('renovacion')) {
      const upcoming = await this.prisma.clientSubscription.count({
        where: { tenantId, status: 'active', renewalDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
      });
      return `Tienes ${upcoming} suscripción(es) que vencen en los próximos 30 días. Revisa el módulo de suscripciones para gestionarlas.`;
    }

    return `Entendido. Puedo ayudarte con información sobre ventas, inventario, compras, clientes y más. ¿Qué necesitas saber específicamente sobre tu negocio?`;
  }
}
