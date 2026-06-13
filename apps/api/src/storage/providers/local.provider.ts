import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StorageProvider, UploadResult } from '../storage.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly basePath: string;

  constructor(private readonly config: ConfigService) {
    this.basePath = config.get<string>('storage.path') ?? './uploads';
  }

  async upload(
    file: Express.Multer.File,
    storagePath: string,
  ): Promise<UploadResult> {
    const dir = path.join(this.basePath, path.dirname(storagePath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fullPath = path.join(this.basePath, storagePath);
    fs.writeFileSync(fullPath, file.buffer);

    const checksum = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    return {
      url: `/uploads/${storagePath}`,
      key: storagePath,
      size: file.size,
      mimeType: file.mimetype,
      checksum,
    };
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.basePath, key);
    try {
      fs.unlinkSync(fullPath);
    } catch (error) {
      this.logger.warn(`File not found for deletion: ${key}`, error);
    }
  }

  async getSignedUrl(key: string, _expiresInSeconds?: number): Promise<string> {
    const appUrl = this.config.get<string>('app.url') ?? 'http://localhost:3001';
    return `${appUrl}/uploads/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, key);
    return fs.existsSync(fullPath);
  }
}
