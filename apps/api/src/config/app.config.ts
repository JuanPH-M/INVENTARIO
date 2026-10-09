import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: parseInt(process.env['APP_PORT'] ?? '3001', 10),
  url: process.env['APP_URL'] ?? 'http://localhost:3001',
  webUrl: process.env['WEB_URL'] ?? 'http://localhost:3000',
  isProduction: process.env['NODE_ENV'] === 'production',
  isDevelopment: process.env['NODE_ENV'] === 'development',
  isTest: process.env['NODE_ENV'] === 'test',
  workerMode: process.env['WORKER_MODE'] === 'true',
  mfaAppName: process.env['MFA_APP_NAME'] ?? 'Inventario SaaS',
  encryptionKey: process.env['ENCRYPTION_KEY'] ?? '',
  superAdminEmail: process.env['SUPER_ADMIN_EMAIL'] ?? 'admin@inventario.dev',
}));
