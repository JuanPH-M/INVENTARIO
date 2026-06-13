import {
  Controller, Get, HttpCode, HttpStatus, NotImplementedException, NotFoundException,
  Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { StorageService } from '../../../storage/storage.service';
import { PERMISSIONS } from '@inventario/shared';
import type { JwtPayload } from '@inventario/types';

@ApiTags('Backups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('backup')
export class BackupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BACKUP_READ)
  @ApiOperation({ summary: 'Listar backups disponibles' })
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.backupRecord.findMany({
      where: { OR: [{ tenantId: user.tenantId }, { tenantId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @Post('create')
  @RequirePermissions(PERMISSIONS.BACKUP_CREATE)
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @ApiOperation({ summary: 'Crear backup manual del sistema (no implementado)' })
  async create() {
    throw new NotImplementedException(
      'La generación de backups automáticos no está habilitada en esta versión. ' +
      'Realiza respaldos manuales desde el panel de administración de PostgreSQL.',
    );
  }

  @Get(':id/status')
  @RequirePermissions(PERMISSIONS.BACKUP_READ)
  @ApiOperation({ summary: 'Estado de un backup' })
  async getStatus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const record = await this.prisma.backupRecord.findFirst({
      where: { id, OR: [{ tenantId: user.tenantId }, { tenantId: null }] },
    });
    if (!record) throw new NotFoundException();
    return record;
  }

  @Get(':id/download')
  @RequirePermissions(PERMISSIONS.BACKUP_DOWNLOAD)
  @ApiOperation({ summary: 'Obtener URL de descarga del backup' })
  async getDownloadUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const record = await this.prisma.backupRecord.findFirst({
      where: { id, status: 'completed', OR: [{ tenantId: user.tenantId }, { tenantId: null }] },
    });
    if (!record || !record.fileUrl) throw new NotFoundException('Backup no encontrado o no completado');

    const signedUrl = await this.storageService.getSignedUrl(record.fileUrl.replace('/uploads/', ''), 3600);
    return { downloadUrl: signedUrl, expiresIn: 3600 };
  }
}
