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
import {
  IsEmail, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString,
  IsUUID, MaxLength, Min, IsBoolean,
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

class CreateClientDto {
  @ApiPropertyOptional({ enum: ['individual', 'business'] })
  @IsOptional() @IsEnum(['individual', 'business']) type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) businessName?: string;
  @ApiProperty() @IsString() @IsNotEmpty() idType!: string;
  @ApiProperty() @IsString() @IsNotEmpty() idNumber!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) creditLimit?: number;
}
class UpdateClientDto extends PartialType(CreateClientDto) {
  @ApiPropertyOptional({ enum: ['active', 'inactive', 'blacklisted'] })
  @IsOptional() @IsEnum(['active', 'inactive', 'blacklisted']) status?: string;
}
class AddClientAddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiProperty() @IsString() @IsNotEmpty() street!: string;
  @ApiProperty() @IsString() @IsNotEmpty() city!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zip?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}
class AddClientNoteDto {
  @ApiProperty() @IsString() @IsNotEmpty() content!: string;
}

@ApiTags('Clientes')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CLIENTS_READ)
  @ApiOperation({ summary: 'Listar clientes' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, limit);
    const where = {
      tenantId: user.tenantId,
      deletedAt: null as null,
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { businessName: { contains: search, mode: 'insensitive' as const } },
          { idNumber: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        include: { addresses: { where: { isDefault: true }, take: 1 } },
      }),
      this.prisma.client.count({ where }),
    ]);
    return paginate(items, total, p, l);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CLIENTS_READ)
  @ApiOperation({ summary: 'Obtener cliente' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: { addresses: true, contacts: true, clientNotes: { orderBy: { createdAt: 'desc' } }, documents: true },
    });
    if (!client) throw new NotFoundException();
    return client;
  }

  @Get(':id/history')
  @RequirePermissions(PERMISSIONS.CLIENTS_VIEW_HISTORY)
  @ApiOperation({ summary: 'Historial de compras y ventas del cliente' })
  async getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, 10);
    // Branch-scoped users only see transactions from their own branch
    const branchFilter = user.branchId ? { branchId: user.branchId } : {};
    const [sales, purchases, totalSales, totalPurchases] = await Promise.all([
      this.prisma.sale.findMany({
        where: { clientId: id, tenantId: user.tenantId, ...branchFilter },
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        select: { id: true, saleNumber: true, total: true, status: true, createdAt: true },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { clientId: id, tenantId: user.tenantId, ...branchFilter },
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        select: { id: true, orderNumber: true, total: true, status: true, createdAt: true },
      }),
      this.prisma.sale.count({ where: { clientId: id, tenantId: user.tenantId, ...branchFilter } }),
      this.prisma.purchaseOrder.count({ where: { clientId: id, tenantId: user.tenantId, ...branchFilter } }),
    ]);
    return { sales, purchases, totalSales, totalPurchases };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CLIENTS_CREATE)
  @ApiOperation({ summary: 'Crear cliente' })
  async create(@Body() dto: CreateClientDto, @CurrentUser() user: JwtPayload) {
    return this.prisma.client.create({ data: { tenantId: user.tenantId, ...dto } });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CLIENTS_UPDATE)
  @ApiOperation({ summary: 'Actualizar cliente' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const c = await this.prisma.client.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!c) throw new NotFoundException();
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  @Post(':id/addresses')
  @RequirePermissions(PERMISSIONS.CLIENTS_UPDATE)
  @ApiOperation({ summary: 'Agregar dirección al cliente' })
  async addAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddClientAddressDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const c = await this.prisma.client.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!c) throw new NotFoundException();
    if (dto.isDefault) {
      await this.prisma.clientAddress.updateMany({ where: { clientId: id }, data: { isDefault: false } });
    }
    return this.prisma.clientAddress.create({ data: { clientId: id, ...dto } });
  }

  @Post(':id/notes')
  @RequirePermissions(PERMISSIONS.CLIENTS_ADD_NOTES)
  @ApiOperation({ summary: 'Agregar nota al cliente' })
  async addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddClientNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const c = await this.prisma.client.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!c) throw new NotFoundException();
    return this.prisma.clientNote.create({ data: { clientId: id, content: dto.content, createdById: user.sub } });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CLIENTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar cliente' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const c = await this.prisma.client.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!c) throw new NotFoundException();
    await this.prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
