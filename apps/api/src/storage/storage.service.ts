import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { STORAGE_PROVIDER, type StorageProvider, type UploadResult } from './storage.interface';

export interface StoragePathOptions {
  tenantId: string;
  module: string;
  entityId?: string;
  filename?: string;
  /** Tipos MIME permitidos; por defecto documentos de oficina, PDF, imágenes y comprimidos. */
  allowedMimeTypes?: string[];
}

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const DOCUMENT_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
];

const MIME_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls', '.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
};

/** Prefijo bajo el cual las imágenes de productos se sirven sin firma (no son datos sensibles). */
const PUBLIC_KEY_PATTERN = /^tenants\/[^/]+\/products\//;

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
    private readonly config: ConfigService,
  ) {}

  async upload(file: Express.Multer.File | undefined, options: StoragePathOptions): Promise<UploadResult> {
    this.assertValidFile(file, options.allowedMimeTypes ?? DOCUMENT_MIME_TYPES);
    const storagePath = this.buildPath(file, options);
    return this.provider.upload(file, storagePath);
  }

  async uploadMany(files: Express.Multer.File[], options: StoragePathOptions): Promise<UploadResult[]> {
    files.forEach((f) => this.assertValidFile(f, options.allowedMimeTypes ?? DOCUMENT_MIME_TYPES));
    return Promise.all(files.map((file) => this.upload(file, options)));
  }

  async delete(keyOrUrl: string): Promise<void> {
    return this.provider.delete(this.normalizeKey(keyOrUrl));
  }

  /** Acepta la clave o la URL guardada en BD ("/uploads/...", "s3://bucket/...", "/api/files/public/..."). */
  async getSignedUrl(keyOrUrl: string, expiresInSeconds?: number): Promise<string> {
    return this.provider.getSignedUrl(this.normalizeKey(keyOrUrl), expiresInSeconds);
  }

  async exists(keyOrUrl: string): Promise<boolean> {
    return this.provider.exists(this.normalizeKey(keyOrUrl));
  }

  read(key: string) {
    return this.provider.read(this.normalizeKey(key));
  }

  /** URL estable para recursos públicos (imágenes de producto). */
  publicUrl(key: string): string {
    return `/api/files/public/${key}`;
  }

  isPublicKey(key: string): boolean {
    return PUBLIC_KEY_PATTERN.test(key) && !key.includes('..');
  }

  normalizeKey(keyOrUrl: string): string {
    return keyOrUrl
      .replace(/^\/api\/files\/public\//, '')
      .replace(/^\/uploads\//, '')
      .replace(/^s3:\/\/[^/]+\//, '')
      .replace(/^\/+/, '');
  }

  buildPath(file: Express.Multer.File, options: StoragePathOptions): string {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const filename = options.filename ?? `${uuidv4()}${ext}`;
    const parts = ['tenants', options.tenantId, options.module];
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

  buildBackupPath(tenantId: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `tenants/${tenantId}/backups/backup_${timestamp}.json.gz`;
  }

  private assertValidFile(
    file: Express.Multer.File | undefined,
    allowed: string[],
  ): asserts file is Express.Multer.File {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('Debes adjuntar un archivo');
    }
    const maxMb = this.config.get<number>('storage.maxFileSizeMb') ?? 50;
    if (file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException(`El archivo supera el tamaño máximo de ${maxMb} MB`);
    }
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(`Tipo de archivo no permitido (${file.mimetype})`);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    const validExt = MIME_EXTENSIONS[file.mimetype];
    if (validExt && !validExt.includes(ext)) {
      throw new BadRequestException(`La extensión ${ext || '(ninguna)'} no corresponde al tipo de archivo`);
    }
  }
}
