import { Module } from '@nestjs/common';
import { CompaniesController } from './presentation/companies.controller';

@Module({ controllers: [CompaniesController] })
export class CompaniesModule {}
