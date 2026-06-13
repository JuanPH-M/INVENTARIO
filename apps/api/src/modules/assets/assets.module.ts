import { Module } from '@nestjs/common';
import { AssetsController } from './presentation/assets.controller';

@Module({ controllers: [AssetsController] })
export class AssetsModule {}
