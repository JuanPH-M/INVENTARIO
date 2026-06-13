import { Module } from '@nestjs/common';
import { ReportsController } from './presentation/reports.controller';

@Module({ controllers: [ReportsController] })
export class ReportsModule {}
