import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SaleItemInputDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty() @IsNumber() @Min(0.001) @Type(() => Number) quantity!: number;
  @ApiProperty() @IsNumber() @Min(0) @Type(() => Number) unitPrice!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class PaymentInputDto {
  @ApiProperty({ enum: ['cash', 'card', 'transfer', 'check', 'credit', 'other'] })
  @IsEnum(['cash', 'card', 'transfer', 'check', 'credit', 'other'])
  type!: string;

  @ApiProperty() @IsNumber() @Min(0.01) @Type(() => Number) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
}

export class CreateSaleDto {
  @ApiProperty() @IsUUID() branchId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cashRegisterSessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  currencyId?: string;

  @ApiPropertyOptional({ enum: ['sale', 'quote', 'layaway', 'consignment'] })
  @IsOptional()
  @IsEnum(['sale', 'quote', 'layaway', 'consignment'])
  type?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerIdType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerIdNum?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) globalDiscount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiProperty({ type: [SaleItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items!: SaleItemInputDto[];

  @ApiProperty({ type: [PaymentInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentInputDto)
  payments!: PaymentInputDto[];
}

export class VoidSaleDto {
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
}

export class GetSalesQueryDto {
  @ApiPropertyOptional() @IsOptional() page?: number;
  @ApiPropertyOptional() @IsOptional() limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
