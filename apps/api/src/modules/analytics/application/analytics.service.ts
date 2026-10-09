import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../cache/cache.service';

const DAY_MS = 86_400_000;
const TZ = process.env['TZ'] || 'America/Bogota';

/** Clave de día (AAAA-MM-DD) en la zona horaria del negocio, no en UTC. */
export function dayKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TZ });
}

const pctChange = (current: number, previous: number): number | null =>
  previous === 0 ? (current === 0 ? 0 : null) : Math.round(((current - previous) / previous) * 1000) / 10;

/**
 * Analíticas consolidadas del negocio: KPIs con variación frente al periodo anterior,
 * utilidad bruta (ventas netas − costo de lo vendido), tendencia diaria, ventas por sede,
 * por medio de pago, productos estrella y valor del inventario.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async overview(tenantId: string, days: number, branchId?: string) {
    const span = Math.min(365, Math.max(7, Math.floor(days) || 30));
    const key = `ANALYTICS_OVERVIEW:${tenantId}:${branchId ?? 'all'}:${span}:${dayKey(new Date())}`;
    return this.cache.getOrSet(key, () => this.compute(tenantId, span, branchId), 120);
  }

  private async compute(tenantId: string, days: number, branchId?: string) {
    const now = new Date();
    const start = new Date(now.getTime() - (days - 1) * DAY_MS);
    start.setHours(0, 0, 0, 0);
    const prevStart = new Date(start.getTime() - days * DAY_MS);
    const scope = { tenantId, ...(branchId ? { branchId } : {}) };
    const completed = { ...scope, status: 'completed' };

    const [current, previous, cogsCurrent, cogsPrevious, salesRows, byBranch, byPayment, topProducts, recentSales, stockRows, purchases, products] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: { ...completed, createdAt: { gte: start } },
          _sum: { total: true, subtotal: true, taxAmount: true, discount: true, changeGiven: true },
          _count: { _all: true },
        }),
        this.prisma.sale.aggregate({
          where: { ...completed, createdAt: { gte: prevStart, lt: start } },
          _sum: { total: true, subtotal: true },
          _count: { _all: true },
        }),
        this.cogs(tenantId, start, now, branchId),
        this.cogs(tenantId, prevStart, start, branchId),
        this.prisma.sale.findMany({
          where: { ...completed, createdAt: { gte: start } },
          select: { createdAt: true, total: true },
        }),
        this.prisma.sale.groupBy({
          by: ['branchId'],
          where: { ...completed, createdAt: { gte: start } },
          _sum: { total: true },
          _count: { _all: true },
        }),
        this.prisma.paymentTransaction.groupBy({
          by: ['type'],
          where: { tenantId, status: { in: ['completed', 'pending'] }, sale: { ...completed, createdAt: { gte: start } } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.saleItem.groupBy({
          by: ['productId', 'productName'],
          where: { sale: { ...completed, createdAt: { gte: start } } },
          _sum: { quantity: true, subtotal: true },
          orderBy: { _sum: { subtotal: 'desc' } },
          take: 8,
        }),
        this.prisma.sale.findMany({
          where: { ...scope, status: { in: ['completed', 'pending', 'voided'] } },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            saleNumber: true,
            total: true,
            status: true,
            createdAt: true,
            customerName: true,
            client: { select: { firstName: true, lastName: true, businessName: true } },
            branch: { select: { name: true } },
            payments: { select: { type: true }, take: 1 },
          },
        }),
        this.prisma.inventoryStock.findMany({
          where: { ...scope, product: { deletedAt: null, trackInventory: true } },
          select: { quantity: true, product: { select: { costPrice: true, salePrice: true, reorderPoint: true } } },
        }),
        this.prisma.purchaseOrder.aggregate({
          where: { ...scope, deletedAt: null, status: { in: ['received', 'partial_received'] }, receivedDate: { gte: start } },
          _sum: { total: true },
          _count: { _all: true },
        }),
        this.prisma.product.count({ where: { tenantId, status: 'active', deletedAt: null } }),
      ]);

    // Tendencia diaria (zona horaria del negocio)
    const daily = new Map<string, { revenue: number; transactions: number }>();
    for (let i = 0; i < days; i++) {
      daily.set(dayKey(new Date(start.getTime() + i * DAY_MS)), { revenue: 0, transactions: 0 });
    }
    for (const s of salesRows) {
      const entry = daily.get(dayKey(s.createdAt));
      if (!entry) continue;
      entry.revenue += Number(s.total);
      entry.transactions += 1;
    }

    const branchNames = new Map(
      (
        await this.prisma.branch.findMany({
          where: { tenantId, id: { in: byBranch.map((b) => b.branchId) } },
          select: { id: true, name: true },
        })
      ).map((b) => [b.id, b.name]),
    );

    const revenue = Number(current._sum.total ?? 0);
    const revenuePrev = Number(previous._sum.total ?? 0);
    const netSales = Number(current._sum.subtotal ?? 0);
    const netSalesPrev = Number(previous._sum.subtotal ?? 0);
    const count = current._count._all;
    const countPrev = previous._count._all;
    const avgTicket = count ? revenue / count : 0;
    const avgTicketPrev = countPrev ? revenuePrev / countPrev : 0;
    const grossProfit = netSales - cogsCurrent;
    const grossProfitPrev = netSalesPrev - cogsPrevious;

    let stockValue = 0;
    let stockRetailValue = 0;
    let lowStock = 0;
    let outOfStock = 0;
    for (const s of stockRows) {
      const qty = Number(s.quantity);
      stockValue += qty * Number(s.product.costPrice ?? 0);
      stockRetailValue += qty * Number(s.product.salePrice ?? 0);
      if (qty <= 0) outOfStock++;
      else if (qty <= Number(s.product.reorderPoint ?? 0)) lowStock++;
    }

    return {
      period: { start, end: now, days },
      kpis: {
        revenue,
        revenueChange: pctChange(revenue, revenuePrev),
        salesCount: count,
        salesCountChange: pctChange(count, countPrev),
        averageTicket: avgTicket,
        averageTicketChange: pctChange(avgTicket, avgTicketPrev),
        grossProfit,
        grossProfitChange: pctChange(grossProfit, grossProfitPrev),
        grossMargin: netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : 0,
        taxCollected: Number(current._sum.taxAmount ?? 0),
        discounts: Number(current._sum.discount ?? 0),
        purchasesTotal: Number(purchases._sum.total ?? 0),
        purchasesCount: purchases._count._all,
      },
      trend: [...daily.entries()].map(([date, v]) => ({ date, revenue: Math.round(v.revenue), transactions: v.transactions })),
      byBranch: byBranch
        .map((b) => ({
          branchId: b.branchId,
          name: branchNames.get(b.branchId) ?? 'Sede',
          revenue: Number(b._sum.total ?? 0),
          transactions: b._count._all,
        }))
        .sort((a, b) => b.revenue - a.revenue),
      // El cambio siempre se entrega en efectivo: se descuenta para mostrar lo realmente recibido
      byPayment: byPayment
        .map((p) => ({
          type: p.type,
          amount: Number(p._sum.amount ?? 0) - (p.type === 'cash' ? Number(current._sum.changeGiven ?? 0) : 0),
          count: p._count._all,
        }))
        .sort((a, b) => b.amount - a.amount),
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.productName,
        quantity: Number(p._sum.quantity ?? 0),
        revenue: Number(p._sum.subtotal ?? 0),
      })),
      recentSales: recentSales.map((s) => ({
        id: s.id,
        saleNumber: s.saleNumber,
        total: Number(s.total),
        status: s.status,
        createdAt: s.createdAt,
        branch: s.branch?.name,
        payment: s.payments[0]?.type ?? null,
        customer:
          s.client?.businessName ||
          [s.client?.firstName, s.client?.lastName].filter(Boolean).join(' ') ||
          s.customerName ||
          'Consumidor final',
      })),
      inventory: {
        activeProducts: products,
        stockValue,
        stockRetailValue,
        lowStock,
        outOfStock,
      },
    };
  }

  /** Costo de la mercancía vendida: unidades salidas por venta × costo unitario registrado. */
  private async cogs(tenantId: string, from: Date, to: Date, branchId?: string): Promise<number> {
    const rows = await this.prisma.inventoryMovement.findMany({
      where: {
        tenantId,
        performedAt: { gte: from, lt: to },
        OR: [{ type: 'sale_out' }, { type: 'return_in', referenceType: 'sale_void' }],
        ...(branchId ? { branchId } : {}),
      },
      select: { quantity: true, unitCost: true, direction: true },
    });
    // Las anulaciones (return_in) restan el costo de lo devuelto
    return rows.reduce((sum, r) => sum - r.direction * Number(r.quantity) * Number(r.unitCost ?? 0), 0);
  }
}
