import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { STORAGE_PROVIDER, type StorageProvider, type UploadResult } from './storage.interface';

export interface StoragePathOptions {
  tenantId: string;
  module: string;
  entityId?: string;
  filename?: string;
}

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
    private readonly config: ConfigService,
  ) {}

  async upload(
    file: Express.Multer.File,
    options: StoragePathOptions,
  ): Promise<UploadResult> {
    const storagePath = this.buildPath(file, options);
    return this.provider.upload(file, storagePath);
  }

  async uploadMany(
    files: Express.Multer.File[],
    options: StoragePathOptions,
  ): Promise<UploadResult[]> {
    return Promise.all(files.map((file) => this.upload(file, options)));
  }

  async delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  async getSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return this.provider.getSignedUrl(key, expiresInSeconds);
  }

  async exists(key: string): Promise<boolean> {
    return this.provider.exists(key);
  }

  buildPath(
    file: Express.Multer.File,
    options: StoragePathOptions,
  ): string {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = options.filename ?? `${uuidv4()}${ext}`;
    const parts = [
      'tenants',
      options.tenantId,
      options.module,
    ];
    if (options.entityId) parts.push(options.entityId);
    parts.push(filename);
    return parts.join('/');
  }

  async uploadRaw(buffer: Buffer, storagePath: string, mimeType: string): Promise<UploadResult> {
    const fakeFile = {
      buffer,
      originalname: storagePath.split('/').pop() ?? 'file',
      size: buffer.length,
      mimetype: mimeType,
    } as Express.Multer.File;
    return this.provider.upload(fakeFile, storagePath);
  }

  buildReportPath(tenantId: string, reportType: string, date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `tenants/${tenantId}/reports/${year}/${month}/${day}/${reportType}_${Date.now()}.pdf`;
  }

  buildBackupPath(tenantId: string | null): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const scope = tenantId ? `tenant_${tenantId}` : 'global';
    return `backups/${scope}_${timestamp}.sql.gz.enc`;
  }

  validateFileType(
    file: Express.Multer.File,
    allowedMimeTypes: string[],
  ): boolean {
    return allowedMimeTypes.includes(file.mimetype);
  }

  validateFileSize(file: Express.Multer.File): boolean {
    const maxMb = this.config.get<number>('storage.maxFileSizeMb') ?? 50;
    return file.size <= maxMb * 1024 * 1024;
  }
}
