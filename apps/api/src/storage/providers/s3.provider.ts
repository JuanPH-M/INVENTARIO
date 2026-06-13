import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import type { StorageProvider, UploadResult } from '../storage.interface';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly s3: AWS.S3;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const s3Config = config.get<{
      bucket: string;
      region: string;
      accessKey: string;
      secretKey: string;
      endpoint: string;
    }>('storage.s3') ?? {
      bucket: '',
      region: 'us-east-1',
      accessKey: '',
      secretKey: '',
      endpoint: '',
    };

    this.bucket = s3Config.bucket;

    this.s3 = new AWS.S3({
      region: s3Config.region,
      accessKeyId: s3Config.accessKey,
      secretAccessKey: s3Config.secretKey,
      ...(s3Config.endpoint ? { endpoint: s3Config.endpoint, s3ForcePathStyle: true } : {}),
    });
  }

  async upload(
    file: Express.Multer.File,
    storagePath: string,
  ): Promise<UploadResult> {
    const checksum = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    await this.s3
      .upload({
        Bucket: this.bucket,
        Key: storagePath,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
        Metadata: { checksum },
      })
      .promise();

    const url = `https://${this.bucket}.s3.amazonaws.com/${storagePath}`;

    return {
      url,
      key: storagePath,
      size: file.size,
      mimeType: file.mimetype,
      checksum,
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.s3.deleteObject({ Bucket: this.bucket, Key: key }).promise();
    } catch (error) {
      this.logger.warn(`S3 delete failed for key: ${key}`, error);
    }
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresInSeconds,
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.headObject({ Bucket: this.bucket, Key: key }).promise();
      return true;
    } catch {
      return false;
    }
  }
}
