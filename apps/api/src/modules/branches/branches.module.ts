import { Module } from '@nestjs/common';
import { BranchesController } from './presentation/branches.controller';

@Module({ controllers: [BranchesController] })
export class BranchesModule {}
