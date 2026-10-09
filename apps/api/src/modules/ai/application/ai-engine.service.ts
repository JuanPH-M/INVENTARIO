import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../cache/cache.service';

const DAY_MS = 86_400_000;
/** Ventana de historia usada para estimar la demanda diaria. */
const HISTORY_DAYS = 30;
/** Días que tarda normalmente un proveedor en entregar + días de cobertura deseados. */
const LEAD_TIME_DAYS = 7;
const COVERAGE_DAYS = 14;

export interface StockForecast {
  productId: string;
  productName: string;
  internalCode: string | null;
  branchId: string;
  branchName: string;
  currentStock: number;
  avgDailySales: number;
  predictedDaysUntilStockout: number | null;
  predictedStockoutDate: string | null;
  recommendedReorderQty: number;
  confidence: number;
  risk: 'critical' | 'high' | 'medium' | 'low';
}

export interface BusinessInsight {
  type: 'warning' | 'info' | 'success';
  category: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  actionUrl?: string;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Motor de inteligencia del negocio.
 * - Pronóstico de agotamiento por producto y sucursal a partir del histórico de salidas por venta.
 * - Insights automáticos (stock, tendencia de ventas, inventario inmovilizado, operaciones).
 * - Asistente conversacional: usa Claude si ANTHROPIC_API_KEY está configurada; si no,
 *   responde con reglas sobre los mismos datos (funciona 100% sin conexión a internet).
 */
@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private readonly anthropic: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {
    this.anthropic = process.env['ANTHROPIC_API_KEY'] ? new Anthropic() : null;
    this.model = process.env['AI_MODEL'] || 'claude-opus-5-5';
  }

  get llmEnabled(): boolean {
    return this.anthropic !== null;
  }

  // ── Pronóstico de stock ─────────────────────────────────────────────

  async stockForecast(tenantId: string, branchId?: string): Promise<StockForecast[]> {
    const key = `AI_FORECAST:${tenantId}:${branchId ?? 'all'}`;
    return this.cache.getOrSet(key, () => this.computeForecast(tenantId, branchId), 600);
  }

  private async computeForecast(tenantId: string, branchId?: string): Promise<StockForecast[]> {
    const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS);

    const [sales, stocks] = await Promise.all([
      this.prisma.inventoryMovement.groupBy({
        by: ['productId', 'branchId'],
        where: {
          tenantId,
          type: 'sale_out',
          performedAt: { gte: since },
          ...(branchId ? { branchId } : {}),
        },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      this.prisma.inventoryStock.findMany({
        where: {
          tenantId,
          ...(branchId ? { branchId } : {}),
          product: { trackInventory: true, deletedAt: null, status: 'active' },
        },
        select: {
          productId: true,
          branchId: true,
          quantity: true,
          reserved: true,
          product: { select: { name: true, internalCode: true, reorderPoint: true } },
          branch: { select: { name: true } },
        },
      }),
    ]);

    const salesMap = new Map(
      sales.map((s) => [`${s.productId}:${s.branchId}`, { qty: Number(s._sum.quantity ?? 0), n: s._count._all }]),
    );

    const forecasts: StockForecast[] = [];
    for (const stock of stocks) {
      const sold = salesMap.get(`${stock.productId}:${stock.branchId}`);
      const available = Math.max(0, Number(stock.quantity) - Number(stock.reserved ?? 0));
      const avgDaily = sold ? sold.qty / HISTORY_DAYS : 0;
      const reorderPoint = Number(stock.product.reorderPoint ?? 0);

      // Sin ventas recientes: solo se alerta si ya está bajo el punto de reorden
      if (avgDaily === 0 && available > reorderPoint) continue;

      const days = avgDaily > 0 ? available / avgDaily : null;
      const target = avgDaily * (LEAD_TIME_DAYS + COVERAGE_DAYS);
      const reorderQty = Math.max(0, Math.ceil(Math.max(target, reorderPoint * 2) - available));

      let risk: StockForecast['risk'] = 'low';
      if (available <= 0 || (days !== null && days <= 3)) risk = 'critical';
      else if ((days !== null && days <= LEAD_TIME_DAYS) || available <= reorderPoint) risk = 'high';
      else if (days !== null && days <= LEAD_TIME_DAYS + COVERAGE_DAYS) risk = 'medium';

      if (risk === 'low') continue;

      // Más transacciones en la ventana = estimación más fiable
      const confidence = sold ? Math.min(0.95, 0.35 + sold.n * 0.04) : 0.3;

      forecasts.push({
        productId: stock.productId,
        productName: stock.product.name,
        internalCode: stock.product.internalCode,
        branchId: stock.branchId,
        branchName: stock.branch.name,
        currentStock: available,
        avgDailySales: round(avgDaily),
        predictedDaysUntilStockout: days !== null ? round(days, 1) : null,
        predictedStockoutDate: days !== null ? new Date(Date.now() + days * DAY_MS).toISOString() : null,
        recommendedReorderQty: reorderQty,
        confidence: round(confidence),
        risk,
      });
    }

    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return forecasts
      .sort(
        (a, b) =>
          order[a.risk] - order[b.risk] ||
          (a.predictedDaysUntilStockout ?? -1) - (b.predictedDaysUntilStockout ?? -1),
      )
      .slice(0, 100);
  }

  // ── Insights ────────────────────────────────────────────────────────

  async insights(tenantId: string): Promise<{ insights: BusinessInsight[]; generatedAt: Date }> {
    return this.cache.getOrSet(`AI_INSIGHTS:${tenantId}`, () => this.computeInsights(tenantId), 300);
  }

  private async computeInsights(tenantId: string) {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * DAY_MS);
    const twoWeeksAgo = new Date(now - 14 * DAY_MS);
    const sixtyDaysAgo = new Date(now - 60 * DAY_MS);

    const [forecast, thisWeek, lastWeek, openIncidents, renewals, maintenance, pendingPOs, soldRecently, stocked] =
      await Promise.all([
        this.stockForecast(tenantId),
        this.prisma.sale.aggregate({
          where: { tenantId, status: 'completed', createdAt: { gte: weekAgo } },
          _sum: { total: true },
          _count: { _all: true },
        }),
        this.prisma.sale.aggregate({
          where: { tenantId, status: 'completed', createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
          _sum: { total: true },
        }),
        this.prisma.incident.count({ where: { tenantId, status: { in: ['open', 'in_progress'] } } }),
        this.prisma.clientSubscription.count({
          where: { tenantId, status: 'active', renewalDate: { lte: new Date(now + 30 * DAY_MS) } },
        }),
        this.prisma.asset.count({
          where: { tenantId, status: 'active', nextMaintenance: { lte: new Date(now + 7 * DAY_MS) } },
        }),
        this.prisma.purchaseOrder.count({
          where: { tenantId, deletedAt: null, status: { in: ['sent', 'confirmed', 'partial_received'] } },
        }),
        this.prisma.inventoryMovement.findMany({
          where: { tenantId, type: 'sale_out', performedAt: { gte: sixtyDaysAgo } },
          distinct: ['productId'],
          select: { productId: true },
        }),
        this.prisma.inventoryStock.findMany({
          where: { tenantId, quantity: { gt: 0 }, product: { deletedAt: null, trackInventory: true } },
          select: { productId: true, quantity: true, product: { select: { costPrice: true } } },
        }),
      ]);

    const insights: BusinessInsight[] = [];

    const critical = forecast.filter((f) => f.risk === 'critical');
    const high = forecast.filter((f) => f.risk === 'high');
    if (critical.length > 0) {
      insights.push({
        type: 'warning',
        category: 'inventory',
        title: `${critical.length} producto(s) a punto de agotarse`,
        description: `Incluye ${critical.slice(0, 3).map((f) => `${f.productName} (${f.branchName})`).join(', ')}. Genera una orden de compra cuanto antes.`,
        priority: 'critical',
        actionUrl: '/dashboard/purchases',
      });
    }
    if (high.length > 0) {
      insights.push({
        type: 'warning',
        category: 'inventory',
        title: `${high.length} producto(s) se agotarán antes de la próxima reposición`,
        description: 'Según el ritmo de ventas de los últimos 30 días, conviene reabastecerlos esta semana.',
        priority: 'high',
        actionUrl: '/dashboard/ai',
      });
    }

    const current = Number(thisWeek._sum.total ?? 0);
    const previous = Number(lastWeek._sum.total ?? 0);
    if (previous > 0) {
      const change = ((current - previous) / previous) * 100;
      if (Math.abs(change) >= 10) {
        insights.push({
          type: change > 0 ? 'success' : 'warning',
          category: 'sales',
          title: change > 0 ? `Ventas en alza: +${change.toFixed(0)}%` : `Ventas a la baja: ${change.toFixed(0)}%`,
          description: `Últimos 7 días frente a la semana anterior (${thisWeek._count._all} venta(s) esta semana).`,
          priority: change > 0 ? 'low' : 'high',
          actionUrl: '/dashboard/analytics',
        });
      }
    }

    const soldIds = new Set(soldRecently.map((m) => m.productId));
    const dead = stocked.filter((s) => !soldIds.has(s.productId));
    if (dead.length > 0) {
      const tiedUp = dead.reduce((sum, s) => sum + Number(s.quantity) * Number(s.product.costPrice ?? 0), 0);
      insights.push({
        type: 'info',
        category: 'inventory',
        title: 'Inventario sin movimiento',
        description: `${dead.length} producto(s) con stock no se han vendido en 60 días (capital inmovilizado aprox. ${tiedUp.toLocaleString('es-CO', { maximumFractionDigits: 0 })}). Considera promociones o traslados entre sedes.`,
        priority: 'medium',
        actionUrl: '/dashboard/inventory',
      });
    }

    if (pendingPOs > 0) {
      insights.push({
        type: 'info',
        category: 'purchases',
        title: 'Órdenes de compra en curso',
        description: `${pendingPOs} orden(es) enviadas pendientes de recibir.`,
        priority: 'low',
        actionUrl: '/dashboard/purchases',
      });
    }
    if (openIncidents > 0) {
      insights.push({
        type: 'info',
        category: 'operations',
        title: 'Incidencias abiertas',
        description: `${openIncidents} incidencia(s) sin resolver.`,
        priority: 'medium',
        actionUrl: '/dashboard/incidents',
      });
    }
    if (renewals > 0) {
      insights.push({
        type: 'warning',
        category: 'subscriptions',
        title: 'Renovaciones próximas',
        description: `${renewals} suscripción(es) vencen en los próximos 30 días.`,
        priority: 'medium',
        actionUrl: '/dashboard/subscriptions',
      });
    }
    if (maintenance > 0) {
      insights.push({
        type: 'warning',
        category: 'assets',
        title: 'Mantenimientos pendientes',
        description: `${maintenance} activo(s) requieren mantenimiento esta semana.`,
        priority: 'high',
        actionUrl: '/dashboard/assets',
      });
    }

    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    insights.sort((a, b) => order[a.priority] - order[b.priority]);
    return { insights, generatedAt: new Date() };
  }

  // ── Asistente ───────────────────────────────────────────────────────

  /** Resumen compacto del estado del negocio que se entrega como contexto al asistente. */
  async businessSnapshot(tenantId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

    const [tenant, today, month, branchSales, topProducts, forecast, insights] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      this.prisma.sale.aggregate({
        where: { tenantId, status: 'completed', createdAt: { gte: startOfDay } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.sale.aggregate({
        where: { tenantId, status: 'completed', createdAt: { gte: startOfMonth } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.sale.groupBy({
        by: ['branchId'],
        where: { tenantId, status: 'completed', createdAt: { gte: startOfMonth } },
        _sum: { total: true },
      }),
      this.prisma.saleItem.groupBy({
        by: ['productName'],
        where: { sale: { tenantId, status: 'completed', createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) } } },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 5,
      }),
      this.stockForecast(tenantId),
      this.insights(tenantId),
    ]);

    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchSales.map((b) => b.branchId) } },
      select: { id: true, name: true },
    });
    const branchName = new Map(branches.map((b) => [b.id, b.name]));

    return {
      empresa: tenant?.name,
      fecha: new Date().toISOString().slice(0, 10),
      ventasHoy: { cantidad: today._count._all, total: Number(today._sum.total ?? 0) },
      ventasMes: { cantidad: month._count._all, total: Number(month._sum.total ?? 0) },
      ventasMesPorSede: branchSales.map((b) => ({
        sede: branchName.get(b.branchId) ?? b.branchId,
        total: Number(b._sum.total ?? 0),
      })),
      productosMasVendidos30d: topProducts.map((p) => ({
        producto: p.productName,
        unidades: Number(p._sum.quantity ?? 0),
        total: Number(p._sum.subtotal ?? 0),
      })),
      riesgoDeAgotamiento: forecast.slice(0, 15).map((f) => ({
        producto: f.productName,
        sede: f.branchName,
        stock: f.currentStock,
        diasRestantes: f.predictedDaysUntilStockout,
        reponerSugerido: f.recommendedReorderQty,
        riesgo: f.risk,
      })),
      alertas: insights.insights.map((i) => `${i.title}: ${i.description}`),
    };
  }

  async answer(
    tenantId: string,
    message: string,
    history: Array<{ role: string; content: string }>,
  ): Promise<{ content: string; tokens: number; source: 'claude' | 'rules' }> {
    const snapshot = await this.businessSnapshot(tenantId);

    if (this.anthropic) {
      try {
        const messages: Anthropic.MessageParam[] = [
          ...history
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-10)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: message },
        ];
        const response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: 4000,
          output_config: { effort: 'low' },
          system:
            'Eres el asistente de negocio de un sistema de inventario y ventas multisucursal. ' +
            'Responde en español, de forma breve y accionable, usando solo los datos del contexto. ' +
            'Si un dato no está en el contexto, dilo y sugiere en qué módulo consultarlo. ' +
            'Usa formato de moneda colombiano cuando hables de dinero.\n\n' +
            `Contexto del negocio (JSON):\n${JSON.stringify(snapshot)}`,
          messages,
        });
        if (response.stop_reason !== 'refusal') {
          const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .trim();
          if (text) {
            return {
              content: text,
              tokens: response.usage.input_tokens + response.usage.output_tokens,
              source: 'claude',
            };
          }
        }
      } catch (err) {
        if (err instanceof Anthropic.APIError) {
          this.logger.warn(`Claude API error ${err.status}: ${err.message}. Usando respuestas por reglas`);
        } else {
          this.logger.warn(`No se pudo consultar a Claude: ${(err as Error).message}`);
        }
      }
    }

    return { content: this.ruleBasedAnswer(message, snapshot), tokens: 0, source: 'rules' };
  }

  private ruleBasedAnswer(message: string, s: Awaited<ReturnType<AiEngineService['businessSnapshot']>>): string {
    const q = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    const money = (n: number) => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    if (/(agot|reponer|pedir|comprar|reorden|stock|inventario)/.test(q)) {
      if (s.riesgoDeAgotamiento.length === 0) return 'No hay productos en riesgo de agotarse según el ritmo de ventas actual. 👍';
      const lines = s.riesgoDeAgotamiento
        .slice(0, 8)
        .map(
          (f) =>
            `• ${f.producto} (${f.sede}): stock ${f.stock}` +
            (f.diasRestantes !== null ? `, ~${f.diasRestantes} día(s) restantes` : '') +
            ` → sugerido pedir ${f.reponerSugerido}`,
        );
      return `Productos que conviene reponer:\n${lines.join('\n')}`;
    }
    if (/(sede|sucursal|tienda)/.test(q)) {
      if (s.ventasMesPorSede.length === 0) return 'Aún no hay ventas registradas este mes.';
      const lines = [...s.ventasMesPorSede].sort((a, b) => b.total - a.total).map((b) => `• ${b.sede}: ${money(b.total)}`);
      return `Ventas del mes por sede:\n${lines.join('\n')}`;
    }
    if (/(mas vendid|top|mejor producto|popular)/.test(q)) {
      if (s.productosMasVendidos30d.length === 0) return 'No hay ventas en los últimos 30 días.';
      return `Productos más vendidos (30 días):\n${s.productosMasVendidos30d
        .map((p, i) => `${i + 1}. ${p.producto} — ${p.unidades} und · ${money(p.total)}`)
        .join('\n')}`;
    }
    if (/(venta|vendi|ingreso|factur)/.test(q)) {
      return `Hoy: ${s.ventasHoy.cantidad} venta(s) por ${money(s.ventasHoy.total)}.\nEste mes: ${s.ventasMes.cantidad} venta(s) por ${money(s.ventasMes.total)}.`;
    }
    if (/(alerta|problema|resumen|como va|estado)/.test(q)) {
      return s.alertas.length ? `Resumen de alertas:\n${s.alertas.map((a) => `• ${a}`).join('\n')}` : 'Todo en orden: no hay alertas activas.';
    }
    return (
      'Puedo ayudarte con: ventas de hoy y del mes, ventas por sede, productos más vendidos, ' +
      'productos por agotarse y qué reponer, y un resumen de alertas. ¿Qué quieres consultar?'
    );
  }
}
