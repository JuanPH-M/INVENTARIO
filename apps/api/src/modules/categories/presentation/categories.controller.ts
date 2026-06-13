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
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { PERMISSIONS } from '@inventario/shared';
import { generateSlug } from '@inventario/shared';
import type { JwtPayload } from '@inventario/types';

class CreateCategoryDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}
class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('Categorías')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATEGORIES_READ)
  @ApiOperation({ summary: 'Árbol completo de categorías' })
  async findAll(@CurrentUser() user: JwtPayload, @Query('flat') flat?: string) {
    if (flat === 'true') {
      return this.prisma.category.findMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    }
    return this.prisma.category.findMany({
      where: { tenantId: user.tenantId, parentId: null, deletedAt: null },
      include: {
        children: {
          where: { deletedAt: null },
          include: {
            children: { where: { deletedAt: null }, include: { _count: { select: { products: true } } } },
            _count: { select: { products: true } },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        _count: { select: { products: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATEGORIES_CREATE)
  @ApiOperation({ summary: 'Crear categoría' })
  async create(@Body() dto: CreateCategoryDto, @CurrentUser() user: JwtPayload) {
    const slug = generateSlug(dto.name);
    return this.prisma.category.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        slug,
        parentId: dto.parentId,
        description: dto.description,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATEGORIES_UPDATE)
  @ApiOperation({ summary: 'Actualizar categoría' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const cat = await this.prisma.category.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!cat) throw new NotFoundException('Categoría no encontrada');
    return this.prisma.category.update({
      where: { id },
      data: { ...dto, ...(dto.name ? { slug: generateSlug(dto.name) } : {}) },
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CATEGORIES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar categoría (soft delete)' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const cat = await this.prisma.category.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!cat) throw new NotFoundException();
    if (cat._count.products > 0 || cat._count.children > 0) {
      throw new NotFoundException('No se puede eliminar: tiene productos o subcategorías asociadas');
    }
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
