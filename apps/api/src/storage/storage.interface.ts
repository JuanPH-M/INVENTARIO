export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
  checksum: string;
}

export interface StorageProvider {
  upload(
    file: Express.Multer.File,
    path: string,
  ): Promise<UploadResult>;

  delete(key: string): Promise<void>;

  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  exists(key: string): Promise<boolean>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
