import { Module } from '@nestjs/common';
import { BackupController } from './presentation/backup.controller';
import { TenantBackupService } from './application/tenant-backup.service';

@Module({
  controllers: [BackupController],
  providers: [TenantBackupService],
  exports: [TenantBackupService],
})
export class BackupModule {}
