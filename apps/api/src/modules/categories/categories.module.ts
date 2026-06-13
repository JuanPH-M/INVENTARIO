import { Module } from '@nestjs/common';
import { CategoriesController } from './presentation/categories.controller';

@Module({ controllers: [CategoriesController] })
export class CategoriesModule {}
