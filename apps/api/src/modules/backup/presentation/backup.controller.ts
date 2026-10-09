import {
  Controller, Get, HttpCode, HttpStatus, NotFoundException,
  Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { StorageService } from '../../../storage/storage.service';
import { TenantBackupService } from '../application/tenant-backup.service';
import { PERMISSIONS } from '@inventario/shared';
import type { JwtPayload } from '@inventario/types';

const serialize = <T extends { fileSize: bigint | null }>(r: T) => ({
  ...r,
  fileSize: r.fileSize !== null ? Number(r.fileSize) : null,
});

@ApiTags('Backups')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('backup')
export class BackupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly backups: TenantBackupService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BACKUP_READ)
  @ApiOperation({ summary: 'Listar copias de seguridad de la empresa' })
  async findAll(@CurrentUser() user: JwtPayload) {
    const records = await this.prisma.backupRecord.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return records.map(serialize);
  }

  @Post('create')
  @RequirePermissions(PERMISSIONS.BACKUP_CREATE)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: 'Crear copia de seguridad de todos los datos de la empresa (JSON comprimido)' })
  async create(@CurrentUser() user: JwtPayload) {
    return serialize(await this.backups.run(user.tenantId, user.sub, 'manual'));
  }

  @Get(':id/status')
  @RequirePermissions(PERMISSIONS.BACKUP_READ)
  @ApiOperation({ summary: 'Estado de una copia de seguridad' })
  async getStatus(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const record = await this.prisma.backupRecord.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!record) throw new NotFoundException();
    return serialize(record);
  }

  @Get(':id/download')
  @RequirePermissions(PERMISSIONS.BACKUP_DOWNLOAD)
  @ApiOperation({ summary: 'URL temporal de descarga (1 hora)' })
  async getDownloadUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const record = await this.prisma.backupRecord.findFirst({
      where: { id, status: 'completed', tenantId: user.tenantId },
    });
    if (!record?.fileUrl) throw new NotFoundException('Copia no encontrada o no completada');
    return { downloadUrl: await this.storageService.getSignedUrl(record.fileUrl, 3600), expiresIn: 3600 };
  }
}
