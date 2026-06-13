import { Module } from '@nestjs/common';
import { SuppliersController } from './presentation/suppliers.controller';

@Module({ controllers: [SuppliersController] })
export class SuppliersModule {}
