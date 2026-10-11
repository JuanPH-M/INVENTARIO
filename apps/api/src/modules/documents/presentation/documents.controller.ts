import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { StorageService } from '../../../storage/storage.service';
import { PERMISSIONS } from '@inventario/shared';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import type { JwtPayload } from '@inventario/types';

class CreateDocumentDto {
  @ApiProperty({
    enum: ['contract','invoice','warranty','certificate','evidence','attachment','purchase_order','receipt','appraisal','id_document','other'],
  })
  @IsEnum(['contract','invoice','warranty','certificate','evidence','attachment','purchase_order','receipt','appraisal','id_document','other'])
  type!: string;

  @ApiProperty() @IsString() @IsNotEmpty() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
  @ApiPropertyOptional() @IsOptional() expiresAt?: string;
}

@ApiTags('Documentos')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  @ApiOperation({ summary: 'Listar documentos' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
    @Query('clientId') clientId?: string,
    @Query('referenceType') referenceType?: string,
    @Query('referenceId') referenceId?: string,
    @Query('search') search?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, limit);
    const where = {
      tenantId: user.tenantId,
      deletedAt: null as null,
      ...(type ? { type } : {}),
      ...(clientId ? { clientId } : {}),
      ...(referenceType ? { referenceType } : {}),
      ...(referenceId ? { referenceId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { firstName: true, lastName: true, businessName: true } },
          branch: { select: { name: true } },
        },
      }),
      this.prisma.document.count({ where }),
    ]);
    return paginate(items, total, p, l);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  @ApiOperation({ summary: 'Obtener documento' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: { signatories: true, versions: { orderBy: { version: 'desc' } }, client: { select: { firstName: true, lastName: true, businessName: true } } },
    });
    if (!doc) throw new NotFoundException();
    return doc;
  }

  @Post('upload')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir documento' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('Adjunta un archivo');
    const result = await this.storageService.upload(file, {
      tenantId: user.tenantId,
      module: 'documents',
    });

    return this.prisma.document.create({
      data: {
        tenantId: user.tenantId,
        branchId: dto.branchId,
        clientId: dto.clientId,
        type: dto.type,
        status: 'active',
        title: dto.title,
        description: dto.description,
        fileUrl: result.url,
        fileSize: result.size,
        mimeType: result.mimeType,
        checksum: result.checksum,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
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
  }

  @Get(':id/signed-url')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_READ)
  @ApiOperation({ summary: 'Obtener URL firmada para visualizar documento' })
  async getSignedUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException();
    const url = await this.storageService.getSignedUrl(doc.fileUrl, 3600);
    return { url, mimeType: doc.mimeType, title: doc.title };
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar documento' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const doc = await this.prisma.document.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
    if (!doc) throw new NotFoundException();
    await this.prisma.document.update({ where: { id }, data: { deletedAt: new Date(), status: 'archived' } });
  }
}
