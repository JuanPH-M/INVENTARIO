import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { CacheService } from '../../../../cache/cache.service';
import { round2 } from './create-sale.use-case';

const VOID_WINDOW_HOURS = 24;

/**
 * Anula una venta revirtiendo todos sus efectos en una sola transacción:
 * inventario, ingreso financiero, movimiento de caja y acumulado del cliente.
 */
@Injectable()
export class VoidSaleUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async execute(saleId: string, tenantId: string, userId: string, reason: string, branchId?: string | null) {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id: saleId,
        tenantId,
        status: { in: ['completed', 'pending'] },
        ...(branchId ? { branchId } : {}),
      },
      include: { items: { include: { product: { select: { trackInventory: true } } } }, payments: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada o no se puede anular');

    const hours = (Date.now() - sale.createdAt.getTime()) / 3_600_000;
    if (hours > VOID_WINDOW_HOURS) {
      throw new BadRequestException(`Solo se pueden anular ventas de las últimas ${VOID_WINDOW_HOURS} horas`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Cambio de estado condicionado: evita anular dos veces en peticiones concurrentes
      const claimed = await tx.sale.updateMany({
        where: { id: saleId, tenantId, status: { in: ['completed', 'pending'] } },
        data: { status: 'voided', voidedById: userId, voidedAt: new Date(), voidReason: reason },
      });
      if (claimed.count === 0) throw new BadRequestException('La venta ya fue anulada');

      // 1. Devolver inventario (solo productos que controlan stock)
      const qtyByProduct = new Map<string, number>();
      for (const item of sale.items) {
        if (!item.product?.trackInventory) continue;
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + Number(item.quantity));
      }
      for (const [productId, qty] of qtyByProduct) {
        const stock = await tx.inventoryStock.upsert({
          where: { tenantId_productId_branchId: { tenantId, productId, branchId: sale.branchId } },
          create: { tenantId, productId, branchId: sale.branchId, quantity: qty, reserved: 0 },
          update: { quantity: { increment: qty } },
        });
        const after = Number(stock.quantity);
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId,
            branchId: sale.branchId,
            type: 'return_in',
            quantity: qty,
            direction: 1,
            stockBefore: after - qty,
            stockAfter: after,
            referenceType: 'sale_void',
            referenceId: saleId,
            notes: `Anulación de venta #${sale.saleNumber}: ${reason}`,
            performedById: userId,
          },
        });
      }

      // 2. Reversar el ingreso financiero
      const incomes = await tx.financialTransaction.findMany({
        where: { tenantId, referenceType: 'sale', referenceId: saleId, type: 'income' },
      });
      for (const income of incomes) {
        await tx.financialTransaction.create({
          data: {
            tenantId,
            branchId: income.branchId,
            type: 'expense',
            description: `Anulación venta #${sale.saleNumber}`,
            amount: income.amount,
            currency: income.currency,
            referenceType: 'sale_void',
            referenceId: saleId,
            transactionDate: new Date(),
            createdById: userId,
          },
        });
      }

      // 3. Reversar el efectivo en caja si la sesión sigue abierta
      if (sale.cashRegisterSessionId) {
        const cashIn = await tx.cashRegisterMovement.findMany({
          where: { sessionId: sale.cashRegisterSessionId, referenceType: 'sale', referenceId: saleId },
        });
        const amount = round2(cashIn.reduce((s, m) => s + Number(m.amount), 0));
        const session = await tx.cashRegisterSession.findFirst({
          where: { id: sale.cashRegisterSessionId, status: 'open' },
          select: { id: true },
        });
        if (amount > 0 && session) {
          await tx.cashRegisterMovement.create({
            data: {
              sessionId: session.id,
              type: 'refund',
              amount,
              description: `Anulación venta #${sale.saleNumber}`,
              referenceType: 'sale_void',
              referenceId: saleId,
              performedById: userId,
            },
          });
          await tx.cashRegisterSession.update({
            where: { id: session.id },
            data: { expectedClosingAmount: { decrement: amount } },
          });
        }
      }

      // 4. Acumulado del cliente y pagos
      if (sale.clientId) {
        await tx.client.updateMany({
          where: { id: sale.clientId, tenantId },
          data: { totalSales: { decrement: sale.total } },
        });
      }
      await tx.paymentTransaction.updateMany({ where: { saleId }, data: { status: 'refunded' } });

      return tx.sale.findFirst({ where: { id: saleId }, include: { items: true, payments: true } });
    });

    await Promise.all([
      this.cache.invalidatePattern(`INV_STOCK:${tenantId}:*`),
      this.cache.invalidatePattern(`INV_LOW_STOCK:${tenantId}:*`),
      this.cache.invalidatePattern(`ANALYTICS_*:${tenantId}:*`),
    ]);
    return result;
  }
}
