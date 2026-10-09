import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, UploadResult } from '../storage.interface';

/** Compatible con AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces, etc. (S3_ENDPOINT). */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const s3Config = config.get<{
      bucket: string;
      region: string;
      accessKey: string;
      secretKey: string;
      endpoint: string;
    }>('storage.s3');

    this.bucket = s3Config?.bucket ?? '';
    this.s3 = new S3Client({
      region: s3Config?.region || 'us-east-1',
      credentials:
        s3Config?.accessKey && s3Config.secretKey
          ? { accessKeyId: s3Config.accessKey, secretAccessKey: s3Config.secretKey }
          : undefined,
      ...(s3Config?.endpoint ? { endpoint: s3Config.endpoint, forcePathStyle: true } : {}),
    });
  }

  async upload(file: Express.Multer.File, storagePath: string): Promise<UploadResult> {
    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
        Metadata: { checksum },
      }),
    );
    return {
      url: `s3://${this.bucket}/${storagePath}`,
      key: storagePath,
      size: file.size,
      mimeType: file.mimetype,
      checksum,
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`S3 delete failed for key: ${key}`, error as Error);
    }
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async read(key: string) {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      stream: res.Body as NodeJS.ReadableStream,
      contentType: res.ContentType,
      size: res.ContentLength,
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
