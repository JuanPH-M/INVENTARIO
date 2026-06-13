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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../cache/cache.service';
import { PERMISSIONS, SYSTEM_ROLES, generateSlug } from '@inventario/shared';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import { CreateCompanyDto, UpdateCompanyDto, UpdateCompanySettingsDto, GetCompaniesQueryDto } from '../application/dtos/company.dto';
import type { JwtPayload } from '@inventario/types';

@ApiTags('Empresas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @Roles(SYSTEM_ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: '[Super Admin] Listar todas las empresas' })
  async findAll(@Query() query: GetCompaniesQueryDto) {
    const { page, limit, skip } = parsePaginationParams(query.page, query.limit);
    const where = {
      deletedAt: null as null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          plan: { select: { name: true, slug: true } },
          _count: { select: { users: true, branches: true, products: true } },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return paginate(tenants, total, page, limit);
  }

  @Get('me')
  @RequirePermissions(PERMISSIONS.COMPANIES_READ)
  @ApiOperation({ summary: 'Obtener empresa actual del usuario autenticado' })
  async getMyCompany(@CurrentUser() user: JwtPayload) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: user.tenantId },
      include: {
        plan: true,
        saasSubscription: true,
        _count: { select: { users: true, branches: true, products: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Empresa no encontrada');
    return tenant;
  }

  @Patch('me/settings')
  @RequirePermissions(PERMISSIONS.COMPANIES_MANAGE_SETTINGS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar configuración de la empresa' })
  async updateSettings(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCompanySettingsDto,
  ) {
    const updated = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { settings: dto.settings as object },
      select: { id: true, settings: true },
    });
    await this.cacheService.del(`tenant:${user.tenantId}:settings`);
    return updated;
  }

  @Patch('me')
  @RequirePermissions(PERMISSIONS.COMPANIES_UPDATE)
  @ApiOperation({ summary: 'Actualizar datos de la empresa' })
  async updateCompany(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        name: dto.name,
        legalName: dto.legalName,
        taxId: dto.taxId,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
      },
    });
  }

  @Get(':id/stats')
  @Roles(SYSTEM_ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: '[Super Admin] Estadísticas de una empresa' })
  async getStats(@Param('id', ParseUUIDPipe) id: string) {
    const [users, branches, products, sales] = await Promise.all([
      this.prisma.user.count({ where: { tenantId: id, deletedAt: null } }),
      this.prisma.branch.count({ where: { tenantId: id, deletedAt: null } }),
      this.prisma.product.count({ where: { tenantId: id, deletedAt: null } }),
      this.prisma.sale.count({ where: { tenantId: id, status: 'completed' } }),
    ]);
    return { users, branches, products, sales };
  }

  @Patch(':id/suspend')
  @Roles(SYSTEM_ROLES.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Super Admin] Suspender empresa' })
  async suspend(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.tenant.update({
      where: { id },
      data: { status: 'suspended' },
    });
  }

  @Patch(':id/activate')
  @Roles(SYSTEM_ROLES.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Super Admin] Activar empresa' })
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.tenant.update({
      where: { id },
      data: { status: 'active' },
    });
  }
}
