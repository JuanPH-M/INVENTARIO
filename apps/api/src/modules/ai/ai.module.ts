import { Module } from '@nestjs/common';
import { AiController } from './presentation/ai.controller';
import { AiEngineService } from './application/ai-engine.service';

@Module({
  controllers: [AiController],
  providers: [AiEngineService],
  exports: [AiEngineService],
})
export class AiModule {}
