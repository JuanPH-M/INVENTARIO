import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, MaxLength, Min, IsArray, IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { PERMISSIONS } from '@inventario/shared';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import type { JwtPayload } from '@inventario/types';

class CreateSubscriptionDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) providerName!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() responsibleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() renewalDate!: string;
  @ApiProperty({ enum: ['monthly','quarterly','annual','biennial'] })
  @IsEnum(['monthly','quarterly','annual','biennial']) billingCycle!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) monthlyCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) annualCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @IsInt({ each: true }) reminderDays?: number[];
}
class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {}

@ApiTags('Suscripciones (Externas)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ)
  @ApiOperation({ summary: 'Listar suscripciones externas de la empresa' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('status') status?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, 50);
    const where = {
      tenantId: user.tenantId,
      deletedAt: null as null,
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.clientSubscription.findMany({ where, skip, take: l, orderBy: { renewalDate: 'asc' } }),
      this.prisma.clientSubscription.count({ where }),
    ]);
    return paginate(items, total, p, l);
  }

  @Get('stats')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ)
  @ApiOperation({ summary: 'Estadísticas de costos de suscripciones' })
  async getStats(@CurrentUser() user: JwtPayload) {
    const subs = await this.prisma.clientSubscription.findMany({
      where: { tenantId: user.tenantId, status: 'active', deletedAt: null },
    });

    let totalMonthly = 0;
    let totalAnnual = 0;

    for (const s of subs) {
      switch (s.billingCycle) {
        case 'monthly':
          totalMonthly += Number(s.monthlyCost ?? 0);
          totalAnnual += Number(s.monthlyCost ?? 0) * 12;
          break;
        case 'quarterly':
          totalMonthly += s.monthlyCost ? Number(s.monthlyCost) : Number(s.annualCost ?? 0) / 12;
          totalAnnual += s.annualCost ? Number(s.annualCost) : Number(s.monthlyCost ?? 0) * 12;
          break;
        case 'annual':
          totalMonthly += Number(s.annualCost ?? 0) / 12;
          totalAnnual += Number(s.annualCost ?? 0);
          break;
      }
    }

    const now = new Date();
    const upcoming = subs.filter((s) => {
      const days = (new Date(s.renewalDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 30;
    });

    return { totalMonthly, totalAnnual, totalActive: subs.length, upcomingRenewals: upcoming };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_CREATE)
  @ApiOperation({ summary: 'Crear suscripción externa' })
  async create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: JwtPayload) {
    return this.prisma.clientSubscription.create({
      data: {
        tenantId: user.tenantId,
        ...dto,
        startDate: new Date(dto.startDate),
        renewalDate: new Date(dto.renewalDate),
        reminderDays: dto.reminderDays ?? [30, 7, 1],
      },
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_UPDATE)
  @ApiOperation({ summary: 'Actualizar suscripción' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const s = await this.prisma.clientSubscription.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!s) throw new NotFoundException();
    return this.prisma.clientSubscription.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar suscripción' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const s = await this.prisma.clientSubscription.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!s) throw new NotFoundException();
    await this.prisma.clientSubscription.update({ where: { id }, data: { deletedAt: new Date(), status: 'cancelled' } });
  }
}
