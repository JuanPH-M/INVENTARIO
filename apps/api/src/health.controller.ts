import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { SkipAudit } from './common/decorators/skip-audit.decorator';
import { PrismaService } from './database/prisma.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipAudit()
  @Get('health')
  @ApiOperation({ summary: 'Health check del servidor' })
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
        version: process.env['npm_package_version'] ?? '1.0.0',
      };
    } catch {
      return { status: 'error', timestamp: new Date().toISOString(), database: 'disconnected' };
    }
  }
}
