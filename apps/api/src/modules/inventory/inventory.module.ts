import { Module } from '@nestjs/common';
import { InventoryUseCase } from './application/use-cases/inventory.use-case';
import { InventoryController } from './presentation/inventory.controller';

@Module({
  controllers: [InventoryController],
  providers: [InventoryUseCase],
  exports: [InventoryUseCase],
})
export class InventoryModule {}
