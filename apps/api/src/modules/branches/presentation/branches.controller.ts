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
import { PERMISSIONS } from '@inventario/shared';
import { CreateBranchDto, UpdateBranchDto } from '../application/dtos/branch.dto';
import type { JwtPayload } from '@inventario/types';
import { BadRequestException } from '@nestjs/common';

@ApiTags('Sucursales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BRANCHES_READ)
  @ApiOperation({ summary: 'Listar sucursales de la empresa' })
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.branch.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { inventoryStock: true, sales: true, cashRegisters: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.BRANCHES_READ)
  @ApiOperation({ summary: 'Obtener sucursal por ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true } },
        cashRegisters: { select: { id: true, name: true, code: true, isActive: true } },
        _count: { select: { inventoryStock: true, sales: true, assets: true, incidents: true } },
      },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    return branch;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BRANCHES_CREATE)
  @ApiOperation({ summary: 'Crear sucursal' })
  async create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.checkBranchLimit(user.tenantId);
    return this.prisma.branch.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        code: dto.code?.toUpperCase(),
        type: dto.type ?? 'physical',
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        managerId: dto.managerId,
        isActive: true,
      },
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.BRANCHES_UPDATE)
  @ApiOperation({ summary: 'Actualizar sucursal' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    return this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code?.toUpperCase(),
        type: dto.type,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        managerId: dto.managerId,
        isActive: dto.isActive,
      },
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.BRANCHES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar sucursal (soft delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: {
        _count: { select: { inventoryStock: true, sales: true, cashRegisters: true } },
      },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    if (branch._count.sales > 0 || branch._count.inventoryStock > 0) {
      throw new BadRequestException(
        'No se puede eliminar una sucursal con ventas o stock activo. Desactívala en su lugar.',
      );
    }

    await this.prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  private async checkBranchLimit(tenantId: string): Promise<void> {
    const [tenant, branchCount] = await Promise.all([
      this.prisma.tenant.findFirst({
        where: { id: tenantId },
        include: { plan: { select: { maxBranches: true } } },
      }),
      this.prisma.branch.count({ where: { tenantId, deletedAt: null } }),
    ]);
    if (!tenant) throw new NotFoundException('Empresa no encontrada');
    const maxBranches = tenant.plan?.maxBranches ?? -1;
    if (maxBranches !== -1 && branchCount >= maxBranches) {
      throw new BadRequestException(
        `Tu plan permite máximo ${maxBranches} sucursales`,
      );
    }
  }
}
