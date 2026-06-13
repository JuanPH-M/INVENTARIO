'use strict';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import { InventoryUseCase } from '../application/use-cases/inventory.use-case';
import {
  AdjustStockDto,
  TransferStockDto,
  PhysicalCountItemDto,
  GetMovementsQueryDto,
  INVENTORY_MOVEMENT_TYPES,
} from '../application/dtos/inventory.dto';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../../database/prisma.service';
import type { JwtPayload } from '@inventario/types';

class CreateMovementDto {
  @ApiProperty() @IsUUID() productId!: string;

  @ApiProperty({ enum: ['IN', 'OUT', 'ADJUSTMENT', 'DAMAGE', 'THEFT', 'REPAIR_IN', 'REPAIR_OUT'] })
  @IsEnum(['IN', 'OUT', 'ADJUSTMENT', 'DAMAGE', 'THEFT', 'REPAIR_IN', 'REPAIR_OUT'])
  type!: string;

  @ApiProperty({ minimum: 0.001 }) @IsNumber() @Min(0.001) @Type(() => Number) quantity!: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) unitCost?: number;

  @ApiProperty({ description: 'Motivo del movimiento' })
  @IsString()
  @IsNotEmpty()
  notes!: string;
}

class PhysicalCountDto {
  @ApiProperty() @IsUUID() branchId!: string;
  @ApiProperty({ type: [PhysicalCountItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhysicalCountItemDto)
  items!: PhysicalCountItemDto[];
}

@ApiTags('Inventario')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryUseCase: InventoryUseCase,
    private readonly prisma: PrismaService,
  ) {}

  @Get('stock')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Consultar stock actual (filtrable por sucursal y producto)' })
  async getStock(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
    @Query('productId') productId?: string,
  ) {
    // Branch-scoped users only see their own branch
    const effectiveBranchId = user.branchId ?? branchId;
    return this.inventoryUseCase.getStock(user.tenantId, effectiveBranchId, productId);
  }

  @Get('alerts/low-stock')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Productos bajo punto de reorden' })
  async getLowStockAlerts(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
  ) {
    // Branch-scoped users only see alerts for their own branch
    const effectiveBranchId = user.branchId ?? branchId;
    return this.inventoryUseCase.getLowStockAlerts(user.tenantId, effectiveBranchId);
  }

  @Get('valuation')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Valorización del inventario' })
  async getValuation(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
  ) {
    const effectiveBranchId = user.branchId ?? branchId;
    return this.inventoryUseCase.getValuation(user.tenantId, effectiveBranchId);
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Historial de movimientos de inventario' })
  async getMovements(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetMovementsQueryDto,
  ) {
    // Branch-scoped users only see movements from their own branch
    const effectiveQuery = user.branchId
      ? { ...query, branchId: user.branchId }
      : query;
    return this.inventoryUseCase.getMovements(user.tenantId, effectiveQuery);
  }

  @Post('movements')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Registrar movimiento de inventario (entrada/salida/ajuste)' })
  async createMovement(
    @Body() dto: CreateMovementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const typeMap: Record<string, string> = {
      IN: 'adjustment_in',
      OUT: 'adjustment_out',
      ADJUSTMENT: 'adjustment_in',
      DAMAGE: 'damage',
      THEFT: 'theft',
      REPAIR_IN: 'repair_in',
      REPAIR_OUT: 'repair_out',
    };

    let resolvedBranchId = user.branchId;
    if (!resolvedBranchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { tenantId: user.tenantId, isActive: true, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (!branch) throw new BadRequestException('No hay sucursales configuradas');
      resolvedBranchId = branch.id;
    }

    return this.inventoryUseCase.adjustStock(
      {
        productId: dto.productId,
        branchId: resolvedBranchId,
        type: (typeMap[dto.type] ?? 'adjustment_in') as import('../application/dtos/inventory.dto').InventoryMovementType,
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        notes: dto.notes,
      },
      user.tenantId,
      user.sub,
    );
  }

  @Post('adjust')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Ajustar stock (entrada, salida, daño, robo, reparación, etc.)' })
  async adjustStock(
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // Branch-scoped users can only adjust stock in their own branch
    if (user.branchId && dto.branchId !== user.branchId) {
      throw new ForbiddenException('Solo puedes ajustar el stock de tu propia sucursal');
    }
    return this.inventoryUseCase.adjustStock(dto, user.tenantId, user.sub);
  }

  @Post('transfer')
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @ApiOperation({ summary: 'Transferir stock entre sucursales' })
  async transferStock(
    @Body() dto: TransferStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // Branch-scoped users can only transfer FROM their own branch
    if (user.branchId && dto.fromBranchId !== user.branchId) {
      throw new ForbiddenException('Solo puedes transferir stock desde tu propia sucursal');
    }
    return this.inventoryUseCase.transferStock(dto, user.tenantId, user.sub);
  }

  @Post('physical-count')
  @RequirePermissions(PERMISSIONS.INVENTORY_COUNT)
  @ApiOperation({ summary: 'Registrar conteo físico de inventario' })
  async physicalCount(
    @Body() dto: PhysicalCountDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // Branch-scoped users can only count their own branch
    if (user.branchId && dto.branchId !== user.branchId) {
      throw new ForbiddenException('Solo puedes registrar conteos de tu propia sucursal');
    }
    return this.inventoryUseCase.physicalCount(
      dto.branchId,
      user.tenantId,
      dto.items,
      user.sub,
    );
  }
}
