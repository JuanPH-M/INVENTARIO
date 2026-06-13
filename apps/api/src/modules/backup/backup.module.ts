import { Module } from '@nestjs/common';
import { BackupController } from './presentation/backup.controller';

@Module({ controllers: [BackupController] })
export class BackupModule {}
