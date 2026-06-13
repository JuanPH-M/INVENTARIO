import {
  Controller, Get, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../cache/cache.service';
import { PERMISSIONS } from '@inventario/shared';
import type { JwtPayload } from '@inventario/types';

@ApiTags('Analíticas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'KPIs del dashboard principal' })
  async getDashboard(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const start = dateFrom ? new Date(dateFrom) : (() => {
      const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
    })();
    const end = dateTo ? new Date(dateTo) : new Date();

    // Branch-scoped users can only see their own branch's analytics
    const effectiveBranchId = user.branchId ?? branchId;
    const tenantFilter = { tenantId: user.tenantId, ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}) };
    const cacheKey = `ANALYTICS_DASH:${user.tenantId}:${effectiveBranchId ?? 'all'}:${start.toDateString()}`;

    return this.cache.getOrSet(cacheKey, async () => {
      const [
        salesStats, purchasesStats, productsCount,
        stockAlertsCount, incidentsOpen, subscriptionsCost,
      ] = await Promise.all([
        this.prisma.sale.aggregate({
          where: { ...tenantFilter, status: 'completed', createdAt: { gte: start, lte: end } },
          _sum: { total: true, discount: true },
          _count: { id: true },
          _avg: { total: true },
        }),
        this.prisma.purchaseOrder.aggregate({
          where: { ...tenantFilter, status: { in: ['received', 'partial_received'] }, createdAt: { gte: start, lte: end } },
          _sum: { total: true },
          _count: { id: true },
        }),
        this.prisma.product.count({ where: { tenantId: user.tenantId, status: 'active', deletedAt: null } }),
        this.prisma.inventoryStock.count({
          where: {
            tenantId: user.tenantId,
            ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
          },
        }),
        this.prisma.incident.count({
          where: { tenantId: user.tenantId, status: { in: ['open', 'in_progress'] } },
        }),
        this.prisma.clientSubscription.findMany({
          where: { tenantId: user.tenantId, status: 'active', deletedAt: null },
          select: { billingCycle: true, monthlyCost: true, annualCost: true },
        }),
      ]);

      const monthlyCost = subscriptionsCost.reduce((total, s) => {
        if (s.billingCycle === 'monthly') return total + Number(s.monthlyCost ?? 0);
        if (s.billingCycle === 'annual') return total + Number(s.annualCost ?? 0) / 12;
        return total;
      }, 0);

      return {
        period: { start, end },
        sales: {
          total: Number(salesStats._sum.total ?? 0),
          count: salesStats._count.id,
          averageTicket: Number(salesStats._avg.total ?? 0),
          totalDiscount: Number(salesStats._sum.discount ?? 0),
        },
        purchases: {
          total: Number(purchasesStats._sum.total ?? 0),
          count: purchasesStats._count.id,
        },
        inventory: {
          activeProducts: productsCount,
          stockLines: stockAlertsCount,
        },
        operations: {
          openIncidents: incidentsOpen,
          monthlySubscriptionCost: monthlyCost,
        },
      };
    }, 60);
  }

  @Get('sales-trend')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Tendencia de ventas (últimos 30 días)' })
  async getSalesTrend(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
  ) {
    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    // Branch-scoped users can only see their own branch's trend
    const effectiveBranchId = user.branchId ?? branchId;
    const cacheKey = `ANALYTICS_TREND:${user.tenantId}:${effectiveBranchId ?? 'all'}`;

    return this.cache.getOrSet(cacheKey, async () => {
      const salesRows = await this.prisma.sale.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'completed',
          createdAt: { gte: since },
          ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        },
        select: { createdAt: true, total: true },
      });

      const dailyMap = new Map<string, { revenue: number; transactions: number }>();
      for (const sale of salesRows) {
        const key = sale.createdAt.toISOString().split('T')[0];
        const entry = dailyMap.get(key) ?? { revenue: 0, transactions: 0 };
        entry.revenue += Number(sale.total);
        entry.transactions += 1;
        dailyMap.set(key, entry);
      }

      const results = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString().split('T')[0];
        const entry = dailyMap.get(key) ?? { revenue: 0, transactions: 0 };
        results.push({ date: key, ...entry });
      }

      return results;
    }, 300);
  }

  @Get('top-products')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Productos más vendidos' })
  async getTopProducts(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
    @Query('limit') limit = 10,
  ) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Branch-scoped users can only see their own branch's top products
    const effectiveBranchId = user.branchId ?? branchId;
    const cacheKey = `ANALYTICS_TOP_PROD:${user.tenantId}:${effectiveBranchId ?? 'all'}:${limit}`;

    return this.cache.getOrSet(cacheKey, () => this.prisma.saleItem.groupBy({
      by: ['productId', 'productName'],
      where: {
        sale: {
          tenantId: user.tenantId,
          status: 'completed',
          createdAt: { gte: thirtyDaysAgo },
          ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        },
      },
      _sum: { quantity: true, subtotal: true },
      _count: { id: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: Number(limit),
    }), 300);
  }

  @Get('top-branches')
  @RequirePermissions(PERMISSIONS.ANALYTICS_ADVANCED)
  @ApiOperation({ summary: 'Rendimiento por sucursal' })
  async getTopBranches(@CurrentUser() user: JwtPayload) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cacheKey = `ANALYTICS_TOP_BR:${user.tenantId}:${user.branchId ?? 'all'}`;
    // Branch-scoped users can only see metrics for their own branch
    return this.cache.getOrSet(cacheKey, () => this.prisma.sale.groupBy({
      by: ['branchId'],
      where: {
        tenantId: user.tenantId,
        status: 'completed',
        createdAt: { gte: thirtyDaysAgo },
        ...(user.branchId ? { branchId: user.branchId } : {}),
      },
      _sum: { total: true },
      _count: { id: true },
      orderBy: { _sum: { total: 'desc' } },
    }), 300);
  }
}
