import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { CreateSaleUseCase } from './application/use-cases/create-sale.use-case';
import { VoidSaleUseCase } from './application/use-cases/void-sale.use-case';
import { SalesController } from './presentation/sales.controller';
import { CashRegisterModule } from '../cash-register/cash-register.module';

@Module({
  imports: [CashRegisterModule, MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 } })],
  controllers: [SalesController],
  providers: [CreateSaleUseCase, VoidSaleUseCase],
  exports: [CreateSaleUseCase, VoidSaleUseCase],
})
export class SalesModule {}
