import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '@inventario/shared';
import { CreateSaleUseCase } from '../application/use-cases/create-sale.use-case';
import { VoidSaleUseCase } from '../application/use-cases/void-sale.use-case';
import { PrismaService } from '../../../database/prisma.service';
import { StorageService } from '../../../storage/storage.service';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import { CreateSaleDto, VoidSaleDto, GetSalesQueryDto } from '../application/dtos/sale.dto';
import type { JwtPayload } from '@inventario/types';
import type { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

class AttachSaleDocumentDto {
  @ApiProperty({ enum: ['contract', 'invoice', 'warranty', 'certificate', 'evidence', 'appraisal', 'receipt', 'attachment', 'other'] })
  @IsEnum(['contract', 'invoice', 'warranty', 'certificate', 'evidence', 'appraisal', 'receipt', 'attachment', 'other'])
  type!: string;

  @ApiProperty() @IsString() @IsNotEmpty() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

@ApiTags('Ventas')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('sales')
export class SalesController {
  constructor(
    private readonly createSaleUseCase: CreateSaleUseCase,
    private readonly voidSaleUseCase: VoidSaleUseCase,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_READ)
  @ApiOperation({ summary: 'Listar ventas con filtros' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetSalesQueryDto,
  ) {
    const { page, limit, skip } = parsePaginationParams(query.page, query.limit);

    // Branch-scoped users can only see their own branch's sales
    const effectiveBranchId = user.branchId ?? query.branchId;

    const where: Prisma.SaleWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { saleNumber: { contains: query.search, mode: 'insensitive' } },
              { customerName: { contains: query.search, mode: 'insensitive' } },
              { customerIdNum: { contains: query.search, mode: 'insensitive' } },
              { client: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { client: { lastName: { contains: query.search, mode: 'insensitive' } } },
              { client: { businessName: { contains: query.search, mode: 'insensitive' } } },
              { client: { idNumber: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: { select: { name: true } },
          client: { select: { firstName: true, lastName: true, businessName: true } },
          payments: { select: { type: true, amount: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  @Get('daily-summary')
  @RequirePermissions(PERMISSIONS.SALES_READ)
  @ApiOperation({ summary: 'Resumen de ventas del día' })
  async getDailySummary(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
    @Query('date') date?: string,
  ) {
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    // Branch-scoped users can only see their own branch's summary
    const effectiveBranchId = user.branchId ?? branchId;

    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'completed',
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        createdAt: { gte: start, lte: end },
      },
      select: { total: true, discount: true, taxAmount: true },
    });

    const totalRevenue = sales.reduce((s, sale) => s + Number(sale.total), 0);
    const totalDiscount = sales.reduce((s, sale) => s + Number(sale.discount), 0);
    const totalTax = sales.reduce((s, sale) => s + Number(sale.taxAmount), 0);

    return {
      date: targetDate.toISOString().split('T')[0],
      totalSales: sales.length,
      totalRevenue,
      totalDiscount,
      totalTax,
      averageTicket: sales.length > 0 ? totalRevenue / sales.length : 0,
    };
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_READ)
  @ApiOperation({ summary: 'Obtener venta por ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId: user.tenantId, ...(user.branchId ? { branchId: user.branchId } : {}) },
      include: {
        items: { include: { product: { select: { images: true } } } },
        payments: true,
        client: true,
        branch: { select: { name: true } },
        currency: { select: { code: true, symbol: true } },
        cashRegisterSession: { select: { id: true } },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return sale;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  @ApiOperation({ summary: 'Crear venta (POS)' })
  async create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.createSaleUseCase.execute(dto, user.tenantId, user.sub);
  }

  @Get(':id/documents')
  @RequirePermissions(PERMISSIONS.SALES_READ)
  @ApiOperation({ summary: 'Listar documentos adjuntos a una venta' })
  async listDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId: user.tenantId, ...(user.branchId ? { branchId: user.branchId } : {}) },
      select: { id: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    return this.prisma.document.findMany({
      where: { tenantId: user.tenantId, referenceType: 'sale', referenceId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Adjuntar documento a una venta (PDF, imagen, contrato)' })
  async attachDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AttachSaleDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId: user.tenantId, ...(user.branchId ? { branchId: user.branchId } : {}) },
      select: { id: true, branchId: true, clientId: true, contractUrl: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    const result = await this.storageService.upload(file, {
      tenantId: user.tenantId,
      module: 'documents',
      entityId: `sale_${id}`,
    });

    const doc = await this.prisma.document.create({
      data: {
        tenantId: user.tenantId,
        branchId: sale.branchId,
        clientId: sale.clientId ?? undefined,
        type: dto.type,
        status: 'active',
        title: dto.title,
        description: dto.description,
        fileUrl: result.url,
        fileSize: result.size,
        mimeType: result.mimeType,
        checksum: result.checksum,
        referenceType: 'sale',
        referenceId: id,
        uploadedById: user.sub,
        versions: {
          create: {
            version: 1,
            fileUrl: result.url,
            fileSize: result.size,
            mimeType: result.mimeType,
            checksum: result.checksum,
            uploadedById: user.sub,
          },
        },
      },
      include: { versions: true },
    });

    if (dto.type === 'contract' && !sale.contractUrl) {
      await this.prisma.sale.update({ where: { id }, data: { contractUrl: result.url } });
    }

    return doc;
  }

  @Patch(':id/contract-signed')
  @RequirePermissions(PERMISSIONS.SALES_UPDATE)
  @ApiOperation({ summary: 'Marcar contrato de venta como firmado' })
  async markContractSigned(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId: user.tenantId, ...(user.branchId ? { branchId: user.branchId } : {}) },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return this.prisma.sale.update({ where: { id }, data: { contractSigned: true } });
  }

  @Patch(':id/void')
  @RequirePermissions(PERMISSIONS.SALES_VOID)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular venta' })
  async voidSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidSaleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.voidSaleUseCase.execute(id, user.tenantId, user.sub, dto.reason, user.branchId);
  }

}
