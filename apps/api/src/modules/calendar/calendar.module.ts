import { Module } from '@nestjs/common';
import { CalendarController } from './presentation/calendar.controller';

@Module({ controllers: [CalendarController] })
export class CalendarModule {}
