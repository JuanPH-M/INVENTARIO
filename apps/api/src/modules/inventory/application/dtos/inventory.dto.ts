import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export const INVENTORY_MOVEMENT_TYPES = [
  'adjustment_in',
  'adjustment_out',
  'damage',
  'theft',
  'repair_in',
  'repair_out',
  'initial_stock',
  'physical_count',
] as const;

export type InventoryMovementType = typeof INVENTORY_MOVEMENT_TYPES[number];

export const OUT_MOVEMENT_TYPES: string[] = ['adjustment_out', 'damage', 'theft', 'repair_out'];

export class AdjustStockDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty() @IsUUID() branchId!: string;

  @ApiProperty({ enum: INVENTORY_MOVEMENT_TYPES })
  @IsEnum(INVENTORY_MOVEMENT_TYPES)
  type!: InventoryMovementType;

  @ApiProperty({ minimum: 0.001 })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity!: number;

  @ApiProperty({ description: 'Justificación obligatoria del movimiento' })
  @IsString()
  @IsNotEmpty()
  notes!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost?: number;
}

export class TransferStockDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty() @IsUUID() fromBranchId!: string;
  @ApiProperty() @IsUUID() toBranchId!: string;

  @ApiProperty({ minimum: 0.001 })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity!: number;

  @ApiProperty({ description: 'Motivo de la transferencia — requerido para auditoría' })
  @IsString()
  @IsNotEmpty()
  notes!: string;
}

export class PhysicalCountItemDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) countedQuantity!: number;
}

export class GetMovementsQueryDto {
  @ApiPropertyOptional() @IsOptional() page?: number;
  @ApiPropertyOptional() @IsOptional() limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() dateTo?: string;
}
