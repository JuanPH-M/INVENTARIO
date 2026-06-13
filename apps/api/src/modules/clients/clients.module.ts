import { Module } from '@nestjs/common';
import { ClientsController } from './presentation/clients.controller';

@Module({ controllers: [ClientsController] })
export class ClientsModule {}
