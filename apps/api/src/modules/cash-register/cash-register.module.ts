import { Module } from '@nestjs/common';
import { CashRegisterUseCase } from './application/use-cases/cash-register.use-case';
import { CashRegisterController } from './presentation/cash-register.controller';

@Module({
  controllers: [CashRegisterController],
  providers: [CashRegisterUseCase],
  exports: [CashRegisterUseCase],
})
export class CashRegisterModule {}
