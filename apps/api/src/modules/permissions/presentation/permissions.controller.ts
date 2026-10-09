import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../database/prisma.service';

@ApiTags('Permisos')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los permisos del sistema' })
  async findAll(@Query('module') module?: string) {
    return this.prisma.permission.findMany({
      where: module ? { module } : undefined,
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  @Get('modules')
  @ApiOperation({ summary: 'Listar módulos con sus permisos agrupados' })
  async groupedByModule() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });

    return permissions.reduce(
      (acc, perm) => {
        const mod = perm.module;
        if (!acc[mod]) acc[mod] = [];
        acc[mod].push(perm);
        return acc;
      },
      {} as Record<string, typeof permissions>,
    );
  }
}
