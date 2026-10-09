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

  /** Lectura en streaming (para servir archivos a través de la API). */
  read(key: string): Promise<{ stream: NodeJS.ReadableStream; contentType?: string; size?: number }>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
