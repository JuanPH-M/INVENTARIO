import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { LocalStorageProvider } from './providers/local.provider';
import { S3StorageProvider } from './providers/s3.provider';
import { STORAGE_PROVIDER } from './storage.interface';
import { FilesController } from './files.controller';

@Global()
@Module({
  controllers: [FilesController],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('storage.driver') ?? 'local';
        if (driver === 's3') return new S3StorageProvider(config);
        return new LocalStorageProvider(config);
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
