import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../cache/cache.service';
import { PERMISSIONS } from '@inventario/shared';
import type { JwtPayload } from '@inventario/types';

class ConvertAmountDto {
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) amount!: number;
  @ApiProperty({ example: 'USD' }) @IsString() @IsNotEmpty() fromCode!: string;
  @ApiProperty({ example: 'COP' }) @IsString() @IsNotEmpty() toCode!: string;
}

class SetExchangeRateDto {
  @ApiProperty({ example: 'USD' }) @IsString() @IsNotEmpty() fromCurrencyCode!: string;
  @ApiProperty({ example: 'COP' }) @IsString() @IsNotEmpty() toCurrencyCode!: string;
  @ApiProperty({ example: 4100 }) @IsNumber() @Min(0.000001) @Type(() => Number) rate!: number;
  @ApiProperty({ example: '2024-01-01' }) @IsDateString() effectiveDate!: string;
}

@ApiTags('Divisas')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('currency')
export class CurrencyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CURRENCY_READ)
  @ApiOperation({ summary: 'Listar divisas disponibles' })
  async findAll() {
    return this.cache.getOrSet('CURRENCIES', () =>
      this.prisma.currency.findMany({
        where: { isActive: true },
        orderBy: { code: 'asc' },
      }), 3600);
  }

  @Get('rates')
  @RequirePermissions(PERMISSIONS.CURRENCY_READ)
  @ApiOperation({ summary: 'Obtener tasas de cambio vigentes' })
  async getRates(
    @CurrentUser() user: JwtPayload,
    @Query('fromCode') fromCode?: string,
    @Query('toCode') toCode?: string,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.exchangeRate.findMany({
      where: {
        tenantId: user.tenantId,
        effectiveDate: { lte: today },
        ...(fromCode ? { fromCurrency: { code: fromCode } } : {}),
        ...(toCode ? { toCurrency: { code: toCode } } : {}),
      },
      include: {
        fromCurrency: { select: { code: true, symbol: true, name: true } },
        toCurrency: { select: { code: true, symbol: true, name: true } },
      },
      orderBy: { effectiveDate: 'desc' },
      distinct: ['fromCurrencyId', 'toCurrencyId'],
    });
  }

  @Post('rates')
  @RequirePermissions(PERMISSIONS.CURRENCY_MANAGE)
  @ApiOperation({ summary: 'Registrar/actualizar tasa de cambio' })
  async setRate(
    @Body() dto: SetExchangeRateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const [from, to] = await Promise.all([
      this.prisma.currency.findUnique({ where: { code: dto.fromCurrencyCode } }),
      this.prisma.currency.findUnique({ where: { code: dto.toCurrencyCode } }),
    ]);

    if (!from || !to) throw new NotFoundException('Divisa no encontrada');

    return this.prisma.exchangeRate.create({
      data: {
        tenantId: user.tenantId,
        fromCurrencyId: from.id,
        toCurrencyId: to.id,
        rate: dto.rate,
        inverseRate: 1 / dto.rate,
        source: 'manual',
        effectiveDate: new Date(dto.effectiveDate),
      },
    });
  }

  @Post('convert')
  @RequirePermissions(PERMISSIONS.CURRENCY_READ)
  @ApiOperation({ summary: 'Convertir monto entre divisas' })
  async convert(
    @Body() body: ConvertAmountDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const rate = await this.prisma.exchangeRate.findFirst({
      where: {
        tenantId: user.tenantId,
        fromCurrency: { code: body.fromCode },
        toCurrency: { code: body.toCode },
      },
      orderBy: { effectiveDate: 'desc' },
    });

    if (!rate) throw new NotFoundException(`No hay tasa de cambio disponible para ${body.fromCode} → ${body.toCode}`);

    return {
      originalAmount: body.amount,
      convertedAmount: body.amount * Number(rate.rate),
      fromCurrency: body.fromCode,
      toCurrency: body.toCode,
      rate: Number(rate.rate),
      rateDate: rate.effectiveDate,
    };
  }
}
