import { Module } from '@nestjs/common';
import { PermissionsController } from './presentation/permissions.controller';

@Module({ controllers: [PermissionsController] })
export class PermissionsModule {}
