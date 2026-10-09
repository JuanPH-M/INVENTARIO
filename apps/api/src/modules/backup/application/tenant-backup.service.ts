import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { gzip } from 'zlib';
import { PrismaService } from '../../../database/prisma.service';
import { StorageService } from '../../../storage/storage.service';

const gzipAsync = promisify(gzip);

/** Modelos que nunca se exportan (secretos o datos efímeros). */
const EXCLUDED_MODELS = new Set(['RefreshToken', 'BackupRecord', 'AuditLog']);
/** Campos sensibles que se omiten en la exportación. */
const SENSITIVE_FIELDS = new Set(['passwordHash', 'mfaSecret', 'mfaBackupCodes', 'passwordResetToken']);

type ModelDelegate = { findMany: (args: unknown) => Promise<Record<string, unknown>[]> };

/**
 * Copia de seguridad lógica de una empresa: exporta todas sus tablas a JSON comprimido (gzip),
 * la guarda en el almacenamiento configurado (disco o S3) y registra checksum SHA-256.
 *
 * Los modelos se descubren a partir del esquema de Prisma: se incluyen los que tienen
 * `tenantId` y las tablas hijas que cuelgan de ellos (ítems de venta, movimientos de caja…),
 * así que nuevos módulos quedan cubiertos sin tocar este servicio.
 *
 * Para respaldos completos del servidor se recomienda además pg_dump (ver README).
 */
@Injectable()
export class TenantBackupService {
  private readonly logger = new Logger(TenantBackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async run(tenantId: string, createdById: string | null, type: 'manual' | 'scheduled' = 'manual') {
    const record = await this.prisma.backupRecord.create({
      data: { tenantId, type, status: 'running', isEncrypted: false, createdById },
    });

    try {
      const data = await this.collect(tenantId);
      const payload = {
        format: 'inventario-pro-backup',
        version: 1,
        tenantId,
        createdAt: new Date().toISOString(),
        tables: data,
      };
      const json = JSON.stringify(payload, (_k, v: unknown) =>
        typeof v === 'bigint' ? v.toString() : v instanceof Prisma.Decimal ? v.toString() : v,
      );
      const buffer = await gzipAsync(Buffer.from(json, 'utf8'));
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
      const storagePath = this.storage.buildBackupPath(tenantId);
      await this.storage.uploadRaw(buffer, storagePath, 'application/gzip');

      const rows = Object.values(data).reduce((sum, list) => sum + list.length, 0);
      return await this.prisma.backupRecord.update({
        where: { id: record.id },
        data: {
          status: 'completed',
          fileUrl: storagePath,
          fileSize: BigInt(buffer.length),
          checksum,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 86_400_000),
          notes: `${Object.keys(data).length} tablas, ${rows} registros`,
        },
      });
    } catch (err) {
      this.logger.error(`Backup de ${tenantId} falló: ${(err as Error).message}`);
      return this.prisma.backupRecord.update({
        where: { id: record.id },
        data: { status: 'failed', completedAt: new Date(), notes: (err as Error).message.slice(0, 500) },
      });
    }
  }

  private async collect(tenantId: string): Promise<Record<string, Record<string, unknown>[]>> {
    const models = Prisma.dmmf.datamodel.models;
    const tenantModels = new Set(models.filter((m) => m.fields.some((f) => f.name === 'tenantId')).map((m) => m.name));
    const result: Record<string, Record<string, unknown>[]> = {};

    for (const model of models) {
      if (EXCLUDED_MODELS.has(model.name) || model.name === 'Tenant') continue;

      let where: Record<string, unknown> | null = null;
      if (tenantModels.has(model.name)) {
        where = { tenantId };
      } else {
        // Tabla hija: filtrar a través de su relación con una tabla de la empresa
        const parent = model.fields.find(
          (f) =>
            f.kind === 'object' &&
            tenantModels.has(f.type) &&
            (f.relationFromFields?.length ?? 0) > 0 &&
            f.isRequired,
        );
        if (parent) where = { [parent.name]: { tenantId } };
      }
      if (!where) continue;

      const delegateName = model.name.charAt(0).toLowerCase() + model.name.slice(1);
      const delegate = (this.prisma as unknown as Record<string, ModelDelegate>)[delegateName];
      if (!delegate?.findMany) continue;

      const rows = await delegate.findMany({ where });
      result[model.name] = rows.map((row) => {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) if (!SENSITIVE_FIELDS.has(k)) clean[k] = v;
        return clean;
      });
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    result['Tenant'] = tenant ? [tenant as unknown as Record<string, unknown>] : [];
    return result;
  }
}
