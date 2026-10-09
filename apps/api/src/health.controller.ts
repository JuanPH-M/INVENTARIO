import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CacheService } from './cache/cache.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { SkipAudit } from './common/decorators/skip-audit.decorator';
import { PrismaService } from './database/prisma.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Public()
  @SkipAudit()
  @SkipThrottle()
  @Get('health')
  @ApiOperation({ summary: 'Health check del servidor' })
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
        cache: this.cache.isRedisReady ? 'redis' : 'memory',
        version: process.env['npm_package_version'] ?? '1.0.0',
      };
    } catch {
      // 503 para que Docker / balanceadores detecten la caída
      throw new ServiceUnavailableException({ status: 'error', database: 'disconnected' });
    }
  }
}
