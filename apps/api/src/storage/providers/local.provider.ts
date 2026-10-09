import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StorageProvider, UploadResult } from '../storage.interface';

/**
 * Almacenamiento en disco local. Los archivos NO se sirven de forma pública:
 * se descargan mediante URLs firmadas con HMAC y con vencimiento (GET /api/files).
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly basePath: string;
  private readonly signingKey: string;

  constructor(private readonly config: ConfigService) {
    this.basePath = path.resolve(config.get<string>('storage.path') ?? './uploads');
    this.signingKey =
      process.env['STORAGE_SIGNING_KEY'] ||
      process.env['ENCRYPTION_KEY'] ||
      config.get<string>('jwt.devSecret') ||
      'inventario-local-storage';
  }

  /** Resuelve la ruta absoluta impidiendo salir del directorio base (path traversal). */
  resolveKey(key: string): string {
    const fullPath = path.resolve(this.basePath, key);
    if (!fullPath.startsWith(this.basePath + path.sep)) {
      throw new Error('Ruta de archivo inválida');
    }
    return fullPath;
  }

  async upload(file: Express.Multer.File, storagePath: string): Promise<UploadResult> {
    const fullPath = this.resolveKey(storagePath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, file.buffer);

    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
    return {
      url: `/uploads/${storagePath}`,
      key: storagePath,
      size: file.size,
      mimeType: file.mimetype,
      checksum,
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.promises.unlink(this.resolveKey(key));
    } catch (error) {
      this.logger.warn(`File not found for deletion: ${key}`, error as Error);
    }
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const sig = this.sign(key, exp);
    const params = new URLSearchParams({ key, exp: String(exp), sig });
    // Ruta relativa: funciona tanto detrás del proxy de Next.js como de nginx
    return `/api/files?${params.toString()}`;
  }

  verifySignature(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = Buffer.from(this.sign(key, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async read(key: string) {
    const fullPath = this.resolveKey(key);
    const stat = await fs.promises.stat(fullPath);
    return { stream: fs.createReadStream(fullPath), size: stat.size };
  }

  private sign(key: string, exp: number): string {
    return crypto.createHmac('sha256', this.signingKey).update(`${key}:${exp}`).digest('base64url');
  }
}
