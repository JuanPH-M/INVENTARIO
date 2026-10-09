import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ADMIN, SELLER, auth, createTestApp, login } from './helpers/app.helper';

describe('Autenticación (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza credenciales inválidas con un mensaje genérico', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: 'incorrecta' })
      .expect(401);
    expect(res.body).toMatchObject({ success: false, statusCode: 401, message: 'Credenciales inválidas' });
  });

  it('devuelve 422 con detalle por campo cuando el cuerpo es inválido', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'no-es-email' }).expect(422);
    expect(res.body.errors).toHaveProperty('email');
    expect(res.body.errors).toHaveProperty('password');
  });

  it('emite access token y refresh token en cookie HttpOnly limitada a /api/auth', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toBeUndefined();
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(res.headers['x-copyright']).toMatch(/Todos los derechos reservados/);
  });

  it('exige autenticación en rutas protegidas', async () => {
    await request(app.getHttpServer()).get('/api/products').expect(401);
  });

  it('devuelve el perfil con permisos efectivos', async () => {
    const { token } = await login(app, ADMIN);
    const res = await request(app.getHttpServer()).get('/api/auth/me').set(auth(token)).expect(200);
    expect(res.body.data.email).toBe(ADMIN.email);
    expect(res.body.data.permissions).toEqual(expect.arrayContaining(['sales:create', 'users:read']));
  });

  it('renueva la sesión con la cookie y detecta la reutilización del token rotado', async () => {
    const { cookie } = await login(app, ADMIN);

    const first = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    expect(first.body.data.accessToken).toEqual(expect.any(String));

    // Reutilizar el mismo token justo después: periodo de gracia (pestañas concurrentes), no se cierran sesiones
    const reused = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    expect(reused.body.message).toBe('Sesión ya renovada');
  });

  it('invalida el access token al cerrar sesión', async () => {
    const { token, cookie } = await login(app, ADMIN);
    await request(app.getHttpServer()).post('/api/auth/logout').set(auth(token)).set('Cookie', cookie).expect(204);
    await request(app.getHttpServer()).get('/api/auth/me').set(auth(token)).expect(401);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('aplica permisos por rol (un vendedor no administra usuarios)', async () => {
    const { token } = await login(app, SELLER);
    await request(app.getHttpServer()).get('/api/users').set(auth(token)).expect(403);
    await request(app.getHttpServer()).get('/api/products/catalog').set(auth(token)).expect(200);
  });

  it('impide que un administrador de empresa use rutas de la plataforma', async () => {
    const { token } = await login(app, ADMIN);
    await request(app.getHttpServer()).get('/api/companies').set(auth(token)).expect(403);
  });
});
