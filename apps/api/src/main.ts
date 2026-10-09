import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { BRAND_NOTICE } from './brand';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    cors: false,
  });

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
  const isDev = nodeEnv === 'development' || nodeEnv === 'test';
  const swaggerEnabled = isDev || process.env['SWAGGER_ENABLED'] === 'true';
  const port = configService.get<number>('app.port') ?? 3001;

  configureApp(app);

  // Swagger — solo en desarrollo (o si SWAGGER_ENABLED=true)
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Inventario Pro API')
      .setDescription(`API de gestión de inventario, ventas y finanzas multisede. ${BRAND_NOTICE}`)
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
  if (swaggerEnabled) {
    console.log(`📚 Swagger docs: http://localhost:${port}/api/docs\n`);
  }
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
