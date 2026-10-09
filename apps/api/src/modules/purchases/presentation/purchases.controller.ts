import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '@inventario/shared';
import { PurchaseUseCase } from '../application/use-cases/purchase.use-case';
import { CreatePurchaseOrderDto, ReceiveItemsDto } from '../application/dtos/purchase.dto';
import { PrismaService } from '../../../database/prisma.service';
import { StorageService } from '../../../storage/storage.service';
import type { JwtPayload } from '@inventario/types';

class AttachPurchaseDocumentDto {
  @ApiProperty({ enum: ['contract', 'invoice', 'purchase_order', 'evidence', 'receipt', 'certificate', 'attachment', 'other'] })
  @IsEnum(['contract', 'invoice', 'purchase_order', 'evidence', 'receipt', 'certificate', 'attachment', 'other'])
  type!: string;

  @ApiProperty() @IsString() @IsNotEmpty() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

@ApiTags('Compras')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly purchaseUseCase: PurchaseUseCase,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASES_READ)
  @ApiOperation({ summary: 'Listar órdenes de compra' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
  ) {
    // Branch-scoped users can only see their own branch's purchase orders
    const effectiveBranchId = user.branchId ?? branchId;
    return this.purchaseUseCase.findMany(user.tenantId, { page, limit, branchId: effectiveBranchId, supplierId, status });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PURCHASES_READ)
  @ApiOperation({ summary: 'Obtener orden de compra' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: user.tenantId, ...(user.branchId ? { branchId: user.branchId } : {}) },
      include: {
        items: { include: { product: { select: { name: true, internalCode: true } } } },
        supplier: true,
        branch: { select: { name: true } },
        currency: { select: { code: true, symbol: true } },
      },
    });
    if (!order) throw new NotFoundException();
    return order;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PURCHASES_CREATE)
  @ApiOperation({ summary: 'Crear orden de compra' })
  async create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: JwtPayload) {
    return this.purchaseUseCase.createWithRetry(dto, user.tenantId, user.sub);
  }

  @Patch(':id/approve')
  @RequirePermissions(PERMISSIONS.PURCHASES_APPROVE)
  @ApiOperation({ summary: 'Aprobar orden de compra' })
  async approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: user.tenantId, status: 'draft', ...(user.branchId ? { branchId: user.branchId } : {}) },
    });
    if (!order) throw new NotFoundException();
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'confirmed', approvedById: user.sub },
    });
  }

  @Patch(':id/send')
  @RequirePermissions(PERMISSIONS.PURCHASES_UPDATE)
  @ApiOperation({ summary: 'Marcar orden como enviada al proveedor' })
  async send(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: user.tenantId, status: { in: ['draft', 'confirmed'] }, ...(user.branchId ? { branchId: user.branchId } : {}) },
    });
    if (!order) throw new NotFoundException();
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'sent' } });
  }

  @Patch(':id/receive')
  @RequirePermissions(PERMISSIONS.PURCHASES_RECEIVE)
  @ApiOperation({ summary: 'Registrar recepción de mercancía' })
  async receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveItemsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.branchId) {
      const order = await this.prisma.purchaseOrder.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { branchId: true },
      });
      if (!order) throw new NotFoundException();
      if (order.branchId !== user.branchId) throw new ForbiddenException('Solo puedes recibir mercancía en tu propia sucursal');
    }
    return this.purchaseUseCase.receiveItems(id, user.tenantId, dto, user.sub);
  }

  @Get(':id/documents')
  @RequirePermissions(PERMISSIONS.PURCHASES_READ)
  @ApiOperation({ summary: 'Listar documentos adjuntos a una orden de compra' })
  async listDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: user.tenantId, ...(user.branchId ? { branchId: user.branchId } : {}) },
      select: { id: true },
    });
    if (!order) throw new NotFoundException();

    return this.prisma.document.findMany({
      where: { tenantId: user.tenantId, referenceType: 'purchase_order', referenceId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Adjuntar documento a una orden de compra (contrato, evidencia, factura)' })
  async attachDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AttachPurchaseDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: user.tenantId, ...(user.branchId ? { branchId: user.branchId } : {}) },
      select: { id: true, branchId: true, contractUrl: true },
    });
    if (!order) throw new NotFoundException();

    const result = await this.storageService.upload(file, {
      tenantId: user.tenantId,
      module: 'documents',
      entityId: `purchase_${id}`,
    });

    const doc = await this.prisma.document.create({
      data: {
        tenantId: user.tenantId,
        branchId: order.branchId ?? undefined,
        type: dto.type,
        status: 'active',
        title: dto.title,
        description: dto.description,
        fileUrl: result.url,
        fileSize: result.size,
        mimeType: result.mimeType,
        checksum: result.checksum,
        referenceType: 'purchase_order',
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

    if (dto.type === 'contract' && !order.contractUrl) {
      await this.prisma.purchaseOrder.update({ where: { id }, data: { contractUrl: result.url } });
    }

    return doc;
  }

  @Patch(':id/contract-signed')
  @RequirePermissions(PERMISSIONS.PURCHASES_UPDATE)
  @ApiOperation({ summary: 'Marcar contrato de compra como firmado' })
  async markContractSigned(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: user.tenantId, ...(user.branchId ? { branchId: user.branchId } : {}) },
    });
    if (!order) throw new NotFoundException();
    return this.prisma.purchaseOrder.update({ where: { id }, data: { contractSigned: true } });
  }

  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.PURCHASES_DELETE)
  @ApiOperation({ summary: 'Cancelar orden de compra' })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: user.tenantId, status: { in: ['draft', 'sent', 'confirmed'] }, ...(user.branchId ? { branchId: user.branchId } : {}) },
    });
    if (!order) throw new NotFoundException('Orden no encontrada o no cancelable');
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'cancelled' } });
  }
}
