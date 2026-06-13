import { Module } from '@nestjs/common';
import { SubscriptionsController } from './presentation/subscriptions.controller';

@Module({ controllers: [SubscriptionsController] })
export class SubscriptionsModule {}
