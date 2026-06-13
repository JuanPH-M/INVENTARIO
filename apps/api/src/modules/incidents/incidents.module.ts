import { Module } from '@nestjs/common';
import { IncidentsController } from './presentation/incidents.controller';

@Module({ controllers: [IncidentsController] })
export class IncidentsModule {}
