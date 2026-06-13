import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { paginate } from '../../../../common/utils/pagination.util';

@Injectable()
export class CashRegisterUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async openSession(
    cashRegisterId: string,
    tenantId: string,
    branchId: string,
    openingAmount: number,
    openedById: string,
    notes?: string,
  ) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, tenantId, branchId, isActive: true, deletedAt: null },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');

    const openSession = await this.prisma.cashRegisterSession.findFirst({
      where: { cashRegisterId, status: 'open' },
    });
    if (openSession) {
      throw new ConflictException('Esta caja ya tiene una sesión abierta');
    }

    const session = await this.prisma.cashRegisterSession.create({
      data: {
        cashRegisterId,
        tenantId,
        branchId,
        openedById,
        openingAmount,
        expectedClosingAmount: openingAmount,
        status: 'open',
        notes,
      },
    });

    await this.prisma.cashRegisterMovement.create({
      data: {
        sessionId: session.id,
        type: 'opening',
        amount: openingAmount,
        description: `Apertura de caja con $${openingAmount}`,
        performedById: openedById,
      },
    });

    return session;
  }

  async closeSession(
    sessionId: string,
    tenantId: string,
    actualAmount: number,
    closedById: string,
    notes?: string,
  ) {
    const session = await this.prisma.cashRegisterSession.findFirst({
      where: { id: sessionId, tenantId, status: 'open' },
      include: { movements: true },
    });
    if (!session) throw new NotFoundException('Sesión no encontrada o ya cerrada');

    const reconciliation = await this.calculateReconciliation(sessionId, Number(session.openingAmount));
    const difference = actualAmount - reconciliation.expectedAmount;

    await this.prisma.cashRegisterSession.update({
      where: { id: sessionId },
      data: {
        closedById,
        closedAt: new Date(),
        status: 'closed',
        actualClosingAmount: actualAmount,
        expectedClosingAmount: reconciliation.expectedAmount,
        difference,
        notes,
      },
    });

    await this.prisma.cashRegisterMovement.create({
      data: {
        sessionId,
        type: 'closing',
        amount: actualAmount,
        description: `Cierre de caja. Diferencia: $${difference.toFixed(0)}`,
        performedById: closedById,
      },
    });

    return { ...reconciliation, actualAmount, difference };
  }

  async addMovement(
    sessionId: string,
    tenantId: string,
    type: string,
    amount: number,
    description: string,
    performedById: string,
    referenceType?: string,
    referenceId?: string,
  ) {
    const session = await this.prisma.cashRegisterSession.findFirst({
      where: { id: sessionId, tenantId, status: 'open' },
    });
    if (!session) throw new NotFoundException('Sesión de caja no encontrada o cerrada');

    const movement = await this.prisma.cashRegisterMovement.create({
      data: {
        sessionId,
        type,
        amount,
        description,
        referenceType,
        referenceId,
        performedById,
      },
    });

    const incomeTypes = ['income', 'sale', 'deposit'];
    const isIncome = incomeTypes.includes(type);
    const delta = isIncome ? amount : -amount;

    await this.prisma.cashRegisterSession.update({
      where: { id: sessionId },
      data: {
        expectedClosingAmount: {
          increment: delta,
        },
      },
    });

    return movement;
  }

  async getOpenSession(cashRegisterId: string, tenantId: string) {
    return this.prisma.cashRegisterSession.findFirst({
      where: { cashRegisterId, tenantId, status: 'open' },
      include: {
        openedBy: { select: { firstName: true, lastName: true } },
        movements: { orderBy: { performedAt: 'asc' } },
      },
    });
  }

  async createRegister(tenantId: string, branchId: string, name: string, code: string) {
    const existing = await this.prisma.cashRegister.findFirst({
      where: { tenantId, code, deletedAt: null },
    });
    if (existing) throw new ConflictException('Ya existe una caja con ese código');

    return this.prisma.cashRegister.create({
      data: { tenantId, branchId, name, code, isActive: true },
      include: { branch: { select: { name: true } } },
    });
  }

  async getRegisters(tenantId: string, branchId?: string) {
    return this.prisma.cashRegister.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        deletedAt: null,
      },
      include: {
        branch: { select: { name: true } },
        sessions: {
          where: { status: 'open' },
          take: 1,
          include: { openedBy: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  async getSessionHistory(tenantId: string, branchId?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = {
      tenantId,
      ...(branchId ? { branchId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.cashRegisterSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
        include: {
          cashRegister: { select: { name: true, code: true } },
          openedBy: { select: { firstName: true, lastName: true } },
          closedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.cashRegisterSession.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  private async calculateReconciliation(
    sessionId: string,
    openingAmount: number,
  ) {
    const movements = await this.prisma.cashRegisterMovement.findMany({
      where: { sessionId },
    });

    let totalSales = 0, totalRefunds = 0, totalIncome = 0;
    let totalExpenses = 0, totalWithdrawals = 0, totalDeposits = 0;

    for (const m of movements) {
      const amount = Number(m.amount);
      switch (m.type) {
        case 'sale': totalSales += amount; break;
        case 'refund': totalRefunds += amount; break;
        case 'income': totalIncome += amount; break;
        case 'expense': totalExpenses += amount; break;
        case 'withdrawal': totalWithdrawals += amount; break;
        case 'deposit': totalDeposits += amount; break;
      }
    }

    const expectedAmount =
      openingAmount +
      totalSales - totalRefunds +
      totalIncome - totalExpenses -
      totalWithdrawals + totalDeposits;

    return {
      openingAmount,
      totalSales,
      totalRefunds,
      totalIncome,
      totalExpenses,
      totalWithdrawals,
      totalDeposits,
      expectedAmount,
    };
  }
}
