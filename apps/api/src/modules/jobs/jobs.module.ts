import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { BackupModule } from '../backup/backup.module';
import { ScheduledJobsService } from './scheduled-jobs.service';

@Module({
  imports: [AiModule, BackupModule],
  providers: [ScheduledJobsService],
})
export class JobsModule {}
