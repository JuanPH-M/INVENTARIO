import { Module } from '@nestjs/common';
import { RolesController } from './presentation/roles.controller';

@Module({
  controllers: [RolesController],
})
export class RolesModule {}
