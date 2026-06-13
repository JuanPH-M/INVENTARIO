import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const helmet = require('helmet');
import { AppModule } from './app.module';
import { buildValidationPipe } from './common/pipes/validation.pipe';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CacheService } from './cache/cache.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    cors: false,
  });

  const configService = app.get(ConfigService);
  const isDev = configService.get<string>('app.nodeEnv') !== 'production';
  const webUrl = configService.get<string>('app.webUrl') ?? 'http://localhost:3000';
  const port = configService.get<number>('app.port') ?? 3001;

  // Cookie parser — required for reading HttpOnly cookies in controllers
  app.use(cookieParser());

  // Security headers
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: isDev ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [webUrl],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Branch-Id'],
    credentials: true,
    maxAge: 86400,
  });

  // Global prefix
  app.setGlobalPrefix('api', { exclude: ['health'] });

  // Global validation pipe
  app.useGlobalPipes(buildValidationPipe());

  // Global JWT guard — todas las rutas requieren auth salvo @Public()
  const reflector = app.get(Reflector);
  const cacheService = app.get(CacheService);
  app.useGlobalGuards(new JwtAuthGuard(reflector, cacheService));

  // Swagger — solo en desarrollo
  if (isDev) {
    const config = new DocumentBuilder()
      .setTitle('Inventario SaaS API')
      .setDescription('API empresarial de gestión de inventarios multisucursal')
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'Bearer',
      )
      .addTag('Autenticación')
      .addTag('Usuarios')
      .addTag('Roles')
      .addTag('Permisos')
      .addTag('Empresas')
      .addTag('Sucursales')
      .addTag('Categorías')
      .addTag('Proveedores')
      .addTag('Productos')
      .addTag('Inventario')
      .addTag('Caja Registradora')
      .addTag('Divisas')
      .addTag('Compras')
      .addTag('Ventas')
      .addTag('Finanzas')
      .addTag('Clientes')
      .addTag('Documentos')
      .addTag('Suscripciones (Externas)')
      .addTag('Calendario')
      .addTag('Activos')
      .addTag('Incidencias')
      .addTag('Notificaciones')
      .addTag('Auditoría')
      .addTag('Reportes')
      .addTag('Analíticas')
      .addTag('Inteligencia Artificial')
      .addTag('Backups')
      .addTag('Health')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
      },
    });
  }

  // Fail fast if JWT keys are missing in production
  if (!isDev && !configService.get<string>('jwt.privateKey')) {
    console.error('FATAL: JWT_PRIVATE_KEY y JWT_PUBLIC_KEY son requeridas en producción');
    process.exit(1);
  }

  await app.listen(port, '0.0.0.0');

  console.log(`\n🚀 API running on http://0.0.0.0:${port}/api`);
  if (isDev) {
    console.log(`📚 Swagger docs: http://localhost:${port}/api/docs\n`);
  }
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
