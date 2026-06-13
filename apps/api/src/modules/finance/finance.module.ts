import { Module } from '@nestjs/common';
import { FinanceController } from './presentation/finance.controller';

@Module({ controllers: [FinanceController] })
export class FinanceModule {}
