import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '@inventario/shared';
import { PrismaService } from '../../../database/prisma.service';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import type { JwtPayload } from '@inventario/types';

@ApiTags('Finanzas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('transactions')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({ summary: 'Listar transacciones financieras' })
  async getTransactions(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
    @Query('branchId') branchId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, limit);
    // Branch-scoped users can only see their own branch's transactions
    const effectiveBranchId = user.branchId ?? branchId;
    const where = {
      tenantId: user.tenantId,
      ...(type ? { type } : {}),
      ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      ...(dateFrom || dateTo
        ? {
            transactionDate: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.financialTransaction.findMany({
        where,
        skip,
        take: l,
        orderBy: { transactionDate: 'desc' },
        include: { branch: { select: { name: true } } },
      }),
      this.prisma.financialTransaction.count({ where }),
    ]);
    return paginate(items, total, p, l);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({ summary: 'Resumen financiero del período' })
  async getSummary(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const start = dateFrom ? new Date(dateFrom) : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();
    const end = dateTo ? new Date(dateTo) : new Date();
    // Branch-scoped users can only see their own branch's summary
    const effectiveBranchId = user.branchId ?? branchId;

    const txs = await this.prisma.financialTransaction.findMany({
      where: {
        tenantId: user.tenantId,
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        transactionDate: { gte: start, lte: end },
      },
      select: { type: true, amount: true },
    });

    const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

    return {
      periodStart: start,
      periodEnd: end,
      totalRevenue: income,
      totalExpenses: expense,
      grossProfit: income - expense,
      grossMargin: income > 0 ? ((income - expense) / income) * 100 : 0,
    };
  }

  @Get('accounts')
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  @ApiOperation({ summary: 'Listar cuentas financieras' })
  async getAccounts(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
  ) {
    // Branch-scoped users can only see their own branch's accounts
    const effectiveBranchId = user.branchId ?? branchId;
    return this.prisma.financialAccount.findMany({
      where: {
        tenantId: user.tenantId,
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        deletedAt: null,
        isActive: true,
      },
      include: { children: { where: { isActive: true } } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }
}
