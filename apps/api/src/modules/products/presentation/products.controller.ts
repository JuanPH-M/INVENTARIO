import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '@inventario/shared';
import { ProductsUseCase } from '../application/use-cases/products.use-case';
import { StorageService } from '../../../storage/storage.service';
import { PrismaService } from '../../../database/prisma.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateJewelryDetailsDto,
  GetProductsQueryDto,
} from '../application/dtos/product.dto';
import type { JwtPayload } from '@inventario/types';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('Productos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsUseCase: ProductsUseCase,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({ summary: 'Listar productos con filtros y paginación' })
  async findAll(@CurrentUser() user: JwtPayload, @Query() query: GetProductsQueryDto) {
    return this.productsUseCase.findMany(user.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({ summary: 'Obtener producto por ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productsUseCase.findById(id, user.tenantId);
  }

  @Get(':id/timeline')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW_TIMELINE)
  @ApiOperation({ summary: 'Historial cronológico completo del producto' })
  async getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productsUseCase.getTimeline(id, user.tenantId);
  }

  @Get(':id/qr')
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({ summary: 'Generar/obtener código QR del producto' })
  async getQrCode(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const dataUrl = await this.productsUseCase.generateQrCode(id, user.tenantId);
    return { qrCodeDataUrl: dataUrl };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Crear producto' })
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: JwtPayload) {
    return this.productsUseCase.create(dto, user.tenantId, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @ApiOperation({ summary: 'Actualizar producto' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productsUseCase.update(id, user.tenantId, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar producto (soft delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.productsUseCase.delete(id, user.tenantId);
  }

  @Post(':id/images')
  @RequirePermissions(PERMISSIONS.PRODUCTS_MANAGE_IMAGES)
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir imágenes del producto' })
  async uploadImages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const product = await this.productsUseCase.findById(id, user.tenantId);
    const existingImages = (product.images as Array<{ url: string; order: number; isPrimary: boolean }>) ?? [];

    const uploaded = await this.storageService.uploadMany(files, {
      tenantId: user.tenantId,
      module: 'products',
      entityId: id,
    });

    const newImages = uploaded.map((u, i) => ({
      url: u.url,
      order: existingImages.length + i,
      isPrimary: existingImages.length === 0 && i === 0,
      caption: '',
    }));

    const allImages = [...existingImages, ...newImages];

    const updated = await this.prisma.product.update({
      where: { id },
      data: { images: allImages },
      select: { id: true, images: true },
    });

    await this.prisma.productEvent.create({
      data: {
        productId: id,
        tenantId: user.tenantId,
        type: 'image_added',
        description: `${files.length} imágenes agregadas`,
        performedById: user.sub,
      },
    });

    return updated;
  }

  @Post(':id/jewelry-details')
  @RequirePermissions(PERMISSIONS.JEWELRY_MANAGE)
  @ApiOperation({ summary: 'Crear/actualizar detalles de joyería' })
  async upsertJewelryDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateJewelryDetailsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productsUseCase.upsertJewelryDetails(id, user.tenantId, dto, user.sub);
  }

  @Get(':id/jewelry-details')
  @RequirePermissions(PERMISSIONS.JEWELRY_READ)
  @ApiOperation({ summary: 'Obtener detalles de joyería del producto' })
  async getJewelryDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.prisma.productJewelryDetail.findFirst({
      where: { productId: id, tenantId: user.tenantId },
    });
  }
}
