import { Module } from '@nestjs/common';
import { AiController } from './presentation/ai.controller';

@Module({ controllers: [AiController] })
export class AiModule {}
