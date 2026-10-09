import { Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import * as path from 'path';
import { Public } from '../common/decorators/public.decorator';
import { SkipAudit } from '../common/decorators/skip-audit.decorator';
import { StorageService } from './storage.service';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.interface';
import { LocalStorageProvider } from './providers/local.provider';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.gz': 'application/gzip',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Descarga de archivos.
 * - /files?key&exp&sig   → URL firmada con vencimiento (almacenamiento local).
 * - /files/public/<key>  → imágenes de producto, sin firma.
 */
@ApiExcludeController()
@SkipThrottle()
@SkipAudit()
@Controller('files')
export class FilesController {
  constructor(
    private readonly storage: StorageService,
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
  ) {}

  @Public()
  @Get()
  async signed(
    @Query('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    if (!(this.provider instanceof LocalStorageProvider)) throw new NotFoundException();
    if (!key || !this.provider.verifySignature(key, Number(exp), sig ?? '')) {
      throw new ForbiddenException('Enlace inválido o vencido');
    }
    await this.stream(key, res, 'private, max-age=300', true);
  }

  @Public()
  @Get('public/*path')
  async publicFile(@Param('path') rawPath: string | string[], @Res() res: Response) {
    const key = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
    if (!this.storage.isPublicKey(key)) throw new NotFoundException();
    await this.stream(key, res, 'public, max-age=86400, immutable', false);
  }

  private async stream(key: string, res: Response, cache: string, attachment: boolean) {
    try {
      const file = await this.storage.read(key);
      const ext = path.extname(key).toLowerCase();
      res.setHeader('Content-Type', file.contentType ?? CONTENT_TYPES[ext] ?? 'application/octet-stream');
      if (file.size) res.setHeader('Content-Length', String(file.size));
      res.setHeader('Cache-Control', cache);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (attachment && !ext.match(/\.(pdf|png|jpe?g|webp|gif)$/)) {
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(key)}"`);
      }
      file.stream.pipe(res);
    } catch {
      throw new NotFoundException('Archivo no encontrado');
    }
  }
}
