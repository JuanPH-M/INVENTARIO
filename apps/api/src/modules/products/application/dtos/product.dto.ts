import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) internalCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) sku?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) shortDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) model?: string;

  @ApiPropertyOptional({ enum: ['physical', 'service', 'digital', 'jewelry', 'asset'] })
  @IsOptional()
  @IsEnum(['physical', 'service', 'digital', 'jewelry', 'asset'])
  type?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) costPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) salePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) minSalePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) unitOfMeasure?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackInventory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) minStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) maxStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) reorderPoint?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) taxRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() taxIncluded?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultLocation?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @Transform(({ value }) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const dangerous = new Set(['__proto__', 'constructor', 'prototype']);
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => !dangerous.has(k)));
  })
  metadata?: Record<string, unknown>;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ enum: ['active', 'inactive', 'discontinued', 'draft'] })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'discontinued', 'draft'])
  status?: string;
}

export class CreateJewelryDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() material?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) karat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) weightGrams?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsObject({ each: true }) stones?: object[];
  @ApiPropertyOptional() @IsOptional() @IsString() certificateNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() certificateType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) appraisedValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() provenance?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hallmarks?: string;
}

export class GetProductsQueryDto {
  @ApiPropertyOptional() @IsOptional() page?: number;
  @ApiPropertyOptional() @IsOptional() limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() lowStock?: boolean;
}
