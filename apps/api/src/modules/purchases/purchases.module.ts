import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PurchaseUseCase } from './application/use-cases/purchase.use-case';
import { PurchasesController } from './presentation/purchases.controller';

@Module({
  imports: [MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 } })],
  controllers: [PurchasesController],
  providers: [PurchaseUseCase],
})
export class PurchasesModule {}
