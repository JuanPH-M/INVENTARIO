import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseItemInputDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty() @IsNumber() @Min(0.001) @Type(() => Number) quantityOrdered!: number;
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) unitCost!: number;

  @ApiPropertyOptional({ description: 'Tasa de impuesto (0.19 = 19 %)' })
  @IsOptional() @IsNumber() @Min(0) @Max(1) @Type(() => Number)
  taxRate?: number;

  @ApiPropertyOptional({ description: 'Descuento como fracción (0.1 = 10 %)' })
  @IsOptional() @IsNumber() @Min(0) @Max(1) @Type(() => Number)
  discountRate?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty() @IsUUID() branchId!: string;
  @ApiProperty() @IsUUID() supplierId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() currencyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expectedDate?: string;
  @ApiPropertyOptional({ description: 'Días de crédito' }) @IsOptional() @IsInt() @Min(0) @Type(() => Number) paymentTerms?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  @ApiProperty({ type: [PurchaseItemInputDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La orden debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemInputDto)
  items!: PurchaseItemInputDto[];
}

export class ReceiveItemInputDto {
  @ApiProperty() @IsUUID() purchaseOrderItemId!: string;
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) quantityReceived!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) location?: string;
}

export class ReceiveItemsDto {
  @ApiProperty({ type: [ReceiveItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemInputDto)
  items!: ReceiveItemInputDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
