import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, MaxLength, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { PERMISSIONS } from '@inventario/shared';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import type { JwtPayload } from '@inventario/types';

class CreateAssetDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @ApiProperty() @IsUUID() branchId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() internalCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiProperty() @IsDateString() acquisitionDate!: string;
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) acquisitionCost!: number;
  @ApiPropertyOptional({ enum: ['straight_line','declining_balance','none'] })
  @IsOptional() @IsEnum(['straight_line','declining_balance','none']) depreciationMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) usefulLifeYears?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) residualValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() warrantyExpires?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() nextMaintenance?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) maintenanceIntervalDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() responsibleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
class UpdateAssetDto extends PartialType(CreateAssetDto) {
  @ApiPropertyOptional({ enum: ['active','maintenance','repair','retired','disposed','stolen'] })
  @IsOptional() @IsEnum(['active','maintenance','repair','retired','disposed','stolen']) status?: string;
}
class AddMaintenanceDto {
  @ApiProperty({ enum: ['preventive','corrective','emergency'] })
  @IsEnum(['preventive','corrective','emergency']) type!: string;
  @ApiProperty() @IsString() @IsNotEmpty() description!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) cost?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() nextScheduled?: string;
}

@ApiTags('Activos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  @ApiOperation({ summary: 'Listar activos' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, limit ?? 20);
    const where = {
      tenantId: user.tenantId,
      deletedAt: null as null,
      ...(branchId ? { branchId } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { serialNumber: { contains: search, mode: 'insensitive' as const } },
              { internalCode: { contains: search, mode: 'insensitive' as const } },
              { brand: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.asset.findMany({
        where, skip, take: l, orderBy: { name: 'asc' },
        include: { branch: { select: { name: true } }, category: { select: { name: true } } },
      }),
      this.prisma.asset.count({ where }),
    ]);
    return paginate(items, total, p, l);
  }

  @Get('maintenance-due')
  @RequirePermissions(PERMISSIONS.ASSETS_READ)
  @ApiOperation({ summary: 'Activos con mantenimiento próximo o vencido' })
  async getMaintenanceDue(@CurrentUser() user: JwtPayload) {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return this.prisma.asset.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        status: 'active',
        nextMaintenance: { lte: future },
      },
      include: { branch: { select: { name: true } } },
      orderBy: { nextMaintenance: 'asc' },
    });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ASSETS_CREATE)
  @ApiOperation({ summary: 'Crear activo' })
  async create(@Body() dto: CreateAssetDto, @CurrentUser() user: JwtPayload) {
    return this.prisma.asset.create({
      data: {
        tenantId: user.tenantId,
        ...dto,
        acquisitionDate: new Date(dto.acquisitionDate),
        ...(dto.warrantyExpires ? { warrantyExpires: new Date(dto.warrantyExpires) } : {}),
        ...(dto.nextMaintenance ? { nextMaintenance: new Date(dto.nextMaintenance) } : {}),
      },
    });
  }

  @Post(':id/maintenance')
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE_MAINTENANCE)
  @ApiOperation({ summary: 'Registrar mantenimiento' })
  async addMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMaintenanceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const asset = await this.prisma.asset.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
    if (!asset) throw new NotFoundException();
    const maintenance = await this.prisma.assetMaintenance.create({
      data: {
        assetId: id,
        type: dto.type,
        description: dto.description,
        cost: dto.cost,
        performedById: user.sub,
        nextScheduled: dto.nextScheduled ? new Date(dto.nextScheduled) : null,
      },
    });
    if (dto.nextScheduled) {
      await this.prisma.asset.update({ where: { id }, data: { nextMaintenance: new Date(dto.nextScheduled) } });
    }
    return maintenance;
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ASSETS_UPDATE)
  @ApiOperation({ summary: 'Actualizar activo' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const a = await this.prisma.asset.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
    if (!a) throw new NotFoundException();
    // Las fechas llegan como 'YYYY-MM-DD' y Prisma exige objetos Date.
    const { acquisitionDate, warrantyExpires, nextMaintenance, ...rest } = dto;
    return this.prisma.asset.update({
      where: { id },
      data: {
        ...rest,
        ...(acquisitionDate ? { acquisitionDate: new Date(acquisitionDate) } : {}),
        ...(warrantyExpires !== undefined ? { warrantyExpires: warrantyExpires ? new Date(warrantyExpires) : null } : {}),
        ...(nextMaintenance !== undefined ? { nextMaintenance: nextMaintenance ? new Date(nextMaintenance) : null } : {}),
      },
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ASSETS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirar activo' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const a = await this.prisma.asset.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!a) throw new NotFoundException();
    await this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date(), status: 'retired' } });
  }
}
