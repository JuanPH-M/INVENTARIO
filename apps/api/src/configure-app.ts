import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { buildValidationPipe } from './common/pipes/validation.pipe';
import { BRAND_NOTICE } from './brand';

/**
 * Configuración HTTP compartida por el servidor (main.ts) y las pruebas e2e,
 * para que ambos se comporten exactamente igual.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('app.nodeEnv') ?? 'development';
  const isDev = nodeEnv === 'development' || nodeEnv === 'test';

  // WEB_URL admite varios orígenes separados por coma (p. ej. dominio público + IP de la LAN)
  const webUrls = (config.get<string>('app.webUrl') ?? 'http://localhost:3000')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  app.use(cookieParser());
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Copyright', BRAND_NOTICE);
    next();
  });
  app.use(helmet());

  app.enableCors({
    origin: isDev ? ['http://localhost:3000', 'http://127.0.0.1:3000', ...webUrls] : webUrls,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Branch-Id'],
    credentials: true,
    maxAge: 86400,
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(buildValidationPipe());

  // Detrás de nginx / balanceador: confiar en X-Forwarded-* para IP real y HTTPS
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
}
