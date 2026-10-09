import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

export const ADMIN = { email: 'admin@empresa.com', password: 'Demo123!' };
export const SELLER = { email: 'vendedor@empresa.com', password: 'Demo123!' };

/** Levanta la aplicación completa (guards, filtros, interceptores) contra la BD de pruebas. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return app;
}

export type Session = { token: string; cookie: string };

export async function login(app: INestApplication, credentials: { email: string; password: string }): Promise<Session> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(credentials).expect(200);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token=')) ?? '';
  return { token: res.body.data.accessToken as string, cookie: cookie.split(';')[0] ?? '' };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
