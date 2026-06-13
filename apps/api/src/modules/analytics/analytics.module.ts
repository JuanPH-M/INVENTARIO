import { Module } from '@nestjs/common';
import { AnalyticsController } from './presentation/analytics.controller';

@Module({ controllers: [AnalyticsController] })
export class AnalyticsModule {}
