import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  driver: (process.env['STORAGE_DRIVER'] ?? 'local') as 'local' | 's3',
  path: process.env['STORAGE_PATH'] ?? './uploads',
  maxFileSizeMb: parseInt(process.env['STORAGE_MAX_FILE_SIZE_MB'] ?? '50', 10),
  s3: {
    bucket: process.env['S3_BUCKET'] ?? '',
    region: process.env['S3_REGION'] ?? 'us-east-1',
    accessKey: process.env['S3_ACCESS_KEY'] ?? '',
    secretKey: process.env['S3_SECRET_KEY'] ?? '',
    endpoint: process.env['S3_ENDPOINT'] ?? '',
  },
}));
