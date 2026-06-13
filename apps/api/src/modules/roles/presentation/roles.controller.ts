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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../cache/cache.service';
import { CACHE_KEYS } from '../../../cache/cache-keys.constant';
import { PERMISSIONS } from '@inventario/shared';
import { generateSlug } from '@inventario/shared';
import { CreateRoleDto, UpdateRoleDto, UpdateRolePermissionsDto } from '../application/dtos/role.dto';
import type { JwtPayload } from '@inventario/types';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @ApiOperation({ summary: 'Listar roles disponibles para la empresa' })
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.role.findMany({
      where: {
        OR: [{ tenantId: user.tenantId }, { tenantId: null }],
        deletedAt: null,
      },
      include: {
        rolePermissions: { include: { permission: { select: { slug: true, name: true, module: true } } } },
        _count: { select: { userRoles: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  @ApiOperation({ summary: 'Obtener rol por ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id, OR: [{ tenantId: user.tenantId }, { tenantId: null }] },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return role;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROLES_CREATE)
  @ApiOperation({ summary: 'Crear rol personalizado' })
  async create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const slug = generateSlug(dto.name);

    const role = await this.prisma.role.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        slug,
        description: dto.description,
        isSystem: false,
      },
    });

    if (dto.permissions && dto.permissions.length > 0) {
      const perms = await this.prisma.permission.findMany({
        where: { slug: { in: dto.permissions } },
        select: { id: true },
      });
      await this.prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }

    return role;
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLES_UPDATE)
  @ApiOperation({ summary: 'Actualizar rol' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId: user.tenantId, isSystem: false },
    });
    if (!role) throw new NotFoundException('Rol no encontrado o no modificable');

    return this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
    });
  }

  @Patch(':id/permissions')
  @RequirePermissions(PERMISSIONS.ROLES_ASSIGN_PERMISSIONS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reemplazar permisos de un rol' })
  async updatePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id, OR: [{ tenantId: user.tenantId }, { tenantId: null }] },
    });
    if (!role || role.isSystem) throw new NotFoundException('Rol no encontrado o no modificable');

    const perms = await this.prisma.permission.findMany({
      where: { slug: { in: dto.permissionSlugs } },
      select: { id: true },
    });

    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await this.prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
    });

    await this.cacheService.invalidatePattern(`perm:*`);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ROLES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar rol personalizado' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId: user.tenantId, isSystem: false },
      include: { _count: { select: { userRoles: true } } },
    });
    if (!role) throw new NotFoundException('Rol no encontrado o no eliminable');
    if (role._count.userRoles > 0) {
      throw new NotFoundException(
        `No se puede eliminar: ${role._count.userRoles} usuarios tienen este rol`,
      );
    }

    await this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
