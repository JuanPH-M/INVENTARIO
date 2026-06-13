import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { PERMISSIONS } from '@inventario/shared';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import type { JwtPayload } from '@inventario/types';

class CreateSupplierDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() legalName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() address?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsString() website?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() paymentTerms?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @ApiPropertyOptional({ enum: ['active', 'inactive', 'blacklisted'] })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'blacklisted'])
  status?: string;
}

@ApiTags('Proveedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_READ)
  @ApiOperation({ summary: 'Listar proveedores' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, limit);
    const where = {
      tenantId: user.tenantId,
      deletedAt: null as null,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, skip, take: l, orderBy: { name: 'asc' } }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginate(items, total, p, l);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_READ)
  @ApiOperation({ summary: 'Obtener proveedor' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const s = await this.prisma.supplier.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: { _count: { select: { purchaseOrders: true, products: true } } },
    });
    if (!s) throw new NotFoundException();
    return s;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_CREATE)
  @ApiOperation({ summary: 'Crear proveedor' })
  async create(@Body() dto: CreateSupplierDto, @CurrentUser() user: JwtPayload) {
    return this.prisma.supplier.create({ data: { tenantId: user.tenantId, ...dto } });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_UPDATE)
  @ApiOperation({ summary: 'Actualizar proveedor' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const s = await this.prisma.supplier.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!s) throw new NotFoundException();
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar proveedor' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const s = await this.prisma.supplier.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!s) throw new NotFoundException();
    await this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
