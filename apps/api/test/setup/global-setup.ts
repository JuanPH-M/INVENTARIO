import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Prepara una base de datos EXCLUSIVA para pruebas e2e.
 * - Usa TEST_DATABASE_URL o, si no existe, la DATABASE_URL de apps/api/.env con el sufijo "_test".
 * - Aplica las migraciones pendientes (prisma migrate deploy, no destructivo) y carga los datos base +
 *   empresa demo. Los seeds son idempotentes y cada prueba crea sus propios datos únicos,
 *   así que la suite puede ejecutarse muchas veces sobre la misma base.
 * Nunca toca la base de datos de desarrollo.
 */
export default async function globalSetup(): Promise<void> {
  const apiDir = path.resolve(__dirname, '../..');
  let url = process.env['TEST_DATABASE_URL'];

  if (!url) {
    const envFile = path.join(apiDir, '.env');
    const line = fs.existsSync(envFile)
      ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
      : undefined;
    const base = (process.env['DATABASE_URL'] ?? line?.slice('DATABASE_URL='.length) ?? '').replace(/^"|"$/g, '');
    if (!base) throw new Error('Define TEST_DATABASE_URL para ejecutar las pruebas e2e');
    url = base.replace(/\/([^/?]+)(\?|$)/, (_m, db: string, q: string) => `/${db.endsWith('_test') ? db : `${db}_test`}${q}`);
  }

  if (!/_test(\?|$)/.test(url.split('/').pop() ?? '')) {
    throw new Error(`Por seguridad la base de datos de pruebas debe terminar en "_test": ${url}`);
  }

  process.env['DATABASE_URL'] = url;
  process.env['NODE_ENV'] = 'test';
  process.env['JOBS_ENABLED'] = 'false';
  process.env['SMTP_HOST'] = '';

  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { cwd: apiDir, env, stdio: 'inherit' });
  execSync('npx ts-node --transpile-only prisma/seeds/seed.ts', { cwd: apiDir, env, stdio: 'inherit' });
}
