import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentsController } from './presentation/documents.controller';

@Module({
  imports: [MulterModule.register({ limits: { fileSize: 100 * 1024 * 1024 } })],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
