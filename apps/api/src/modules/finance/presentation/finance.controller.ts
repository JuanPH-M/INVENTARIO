import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '@inventario/shared';
import { PrismaService } from '../../../database/prisma.service';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import type { JwtPayload } from '@inventario/types';

class CreateTransactionDto {
  @ApiProperty({ enum: ['income', 'expense'] }) @IsIn(['income', 'expense']) type!: 'income' | 'expense';
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) description!: string;
  @ApiProperty() @IsNumber() @Min(0.01) @Type(() => Number) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional({ example: '2026-10-09' }) @IsOptional() @IsDateString() transactionDate?: string;
  @ApiPropertyOptional({ example: 'COP' }) @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

@ApiTags('Finanzas')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
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

  @Post('transactions')
  @RequirePermissions(PERMISSIONS.FINANCE_CREATE)
  @ApiOperation({ summary: 'Registrar un gasto o ingreso manual (arriendo, nómina, servicios, otros ingresos)' })
  async createTransaction(@CurrentUser() user: JwtPayload, @Body() dto: CreateTransactionDto) {
    const branchId = user.branchId ?? dto.branchId ?? null;
    if (branchId) {
      const branch = await this.prisma.branch.count({ where: { id: branchId, tenantId: user.tenantId, deletedAt: null } });
      if (!branch) throw new BadRequestException('Sucursal no encontrada');
    }
    return this.prisma.financialTransaction.create({
      data: {
        tenantId: user.tenantId,
        branchId,
        type: dto.type,
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency ?? 'COP',
        referenceType: 'manual',
        transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
        createdById: user.sub,
      },
      include: { branch: { select: { name: true } } },
    });
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
