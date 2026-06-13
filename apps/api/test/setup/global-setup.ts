export default async function globalSetup() {
  process.env['NODE_ENV'] = 'test';
  process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? '';
  process.env['JWT_SECRET'] = 'test-jwt-secret-for-e2e-tests-only';
  process.env['REDIS_URL'] = process.env['TEST_REDIS_URL'] ?? 'redis://localhost:6379/1';
  process.env['STORAGE_PROVIDER'] = 'local';
  process.env['STORAGE_LOCAL_PATH'] = '/tmp/inventario-test-uploads';
}
