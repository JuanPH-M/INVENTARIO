import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ProductsUseCase } from './application/use-cases/products.use-case';
import { ProductsController } from './presentation/products.controller';

@Module({
  imports: [
    MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 }, storage: undefined }),
  ],
  controllers: [ProductsController],
  providers: [ProductsUseCase],
  exports: [ProductsUseCase],
})
export class ProductsModule {}
