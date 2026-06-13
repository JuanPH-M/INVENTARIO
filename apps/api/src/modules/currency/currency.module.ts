import { Module } from '@nestjs/common';
import { CurrencyController } from './presentation/currency.controller';

@Module({ controllers: [CurrencyController] })
export class CurrencyModule {}
