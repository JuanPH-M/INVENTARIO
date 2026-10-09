import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { AiEngineService } from '../ai/application/ai-engine.service';
import { TenantBackupService } from '../backup/application/tenant-backup.service';

const jobsEnabled = () => process.env['NODE_ENV'] !== 'test' && process.env['JOBS_ENABLED'] !== 'false';

/**
 * Tareas programadas (zona horaria configurable con TZ, por defecto America/Bogota).
 * En despliegues con varias instancias de la API, deja JOBS_ENABLED=true solo en una.
 */
@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiEngineService,
    private readonly backups: TenantBackupService,
  ) {}

  /** Cada mañana: notifica a los responsables de inventario los productos por agotarse. */
  @Cron('0 7 * * *', { timeZone: process.env['TZ'] || 'America/Bogota' })
  async notifyStockRisks(): Promise<void> {
    if (!jobsEnabled()) return;
    const tenants = await this.prisma.tenant.findMany({ where: { status: 'active', deletedAt: null }, select: { id: true } });

    for (const { id: tenantId } of tenants) {
      try {
        const forecast = (await this.ai.stockForecast(tenantId)).filter((f) => f.risk === 'critical' || f.risk === 'high');
        if (forecast.length === 0) continue;

        const recipients = await this.prisma.user.findMany({
          where: {
            tenantId,
            status: 'active',
            deletedAt: null,
            userRoles: {
              some: {
                role: { rolePermissions: { some: { permission: { slug: { in: ['inventory:adjust', 'purchases:create'] } } } } },
              },
            },
          },
          select: { id: true },
        });
        if (recipients.length === 0) continue;

        const critical = forecast.filter((f) => f.risk === 'critical').length;
        const top = forecast.slice(0, 5).map((f) => `${f.productName} (${f.branchName}): ${f.currentStock} und`);
        await this.prisma.notification.createMany({
          data: recipients.map((u) => ({
            tenantId,
            userId: u.id,
            type: 'stock_alert',
            title: `${forecast.length} producto(s) necesitan reposición${critical ? ` · ${critical} crítico(s)` : ''}`,
            body: top.join('\n'),
            priority: critical ? 'high' : 'normal',
            referenceType: 'ai_forecast',
            expiresAt: new Date(Date.now() + 2 * 86_400_000),
          })),
        });
      } catch (err) {
        this.logger.warn(`Alertas de stock para ${tenantId} fallaron: ${(err as Error).message}`);
      }
    }
  }

  /** Cada noche: copia de seguridad automática por empresa (BACKUP_SCHEDULE_ENABLED=true). */
  @Cron('0 2 * * *', { timeZone: process.env['TZ'] || 'America/Bogota' })
  async nightlyBackups(): Promise<void> {
    if (!jobsEnabled() || process.env['BACKUP_SCHEDULE_ENABLED'] !== 'true') return;
    const tenants = await this.prisma.tenant.findMany({ where: { status: 'active', deletedAt: null }, select: { id: true } });
    for (const t of tenants) await this.backups.run(t.id, null, 'scheduled');
    this.logger.log(`Backups nocturnos completados para ${tenants.length} empresa(s)`);
  }

  /** Limpieza: sesiones vencidas y notificaciones expiradas. */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanup(): Promise<void> {
    if (!jobsEnabled()) return;
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const [tokens, notifications] = await Promise.all([
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
      this.prisma.notification.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);
    if (tokens.count || notifications.count) {
      this.logger.log(`Limpieza: ${tokens.count} sesiones y ${notifications.count} notificaciones eliminadas`);
    }
  }
}
