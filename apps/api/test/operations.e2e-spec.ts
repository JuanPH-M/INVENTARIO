import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ADMIN, auth, createTestApp, login } from './helpers/app.helper';

/**
 * Flujo operativo completo de una cadena: producto → existencias por sede → traslado →
 * venta en POS → anulación → compra y recepción. Verifica que el inventario cuadre en cada paso.
 */
describe('Operación multisede (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let branchA: string;
  let branchB: string;
  let productId: string;

  const http = () => request(app.getHttpServer());
  const stockOf = async (branchId: string) => {
    const res = await http().get('/api/products/catalog').query({ branchId }).set(auth(token)).expect(200);
    return (res.body.data as Array<{ id: string; available: number }>).find((p) => p.id === productId)?.available ?? 0;
  };

  beforeAll(async () => {
    app = await createTestApp();
    ({ token } = await login(app, ADMIN));

    const branches = (await http().get('/api/branches').set(auth(token)).expect(200)).body.data as Array<{ id: string }>;
    branchA = branches[0]!.id;
    branchB = branches[1]!.id;

    const product = await http()
      .post('/api/products')
      .set(auth(token))
      .send({ name: 'Producto e2e', internalCode: `E2E-${Date.now()}`, salePrice: 10_000, costPrice: 6_000, taxRate: 0.19, taxIncluded: true })
      .expect(201);
    productId = product.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('registra un ajuste de entrada en la sede A', async () => {
    await http()
      .post('/api/inventory/adjust')
      .set(auth(token))
      .send({ productId, branchId: branchA, type: 'initial_stock', quantity: 20, notes: 'Inventario inicial e2e' })
      .expect(201);
    expect(await stockOf(branchA)).toBe(20);
  });

  it('traslada unidades de la sede A a la sede B', async () => {
    await http()
      .post('/api/inventory/transfer')
      .set(auth(token))
      .send({ productId, fromBranchId: branchA, toBranchId: branchB, quantity: 5, notes: 'Reposición e2e' })
      .expect(201);
    expect(await stockOf(branchA)).toBe(15);
    expect(await stockOf(branchB)).toBe(5);
  });

  it('no permite trasladar más de lo disponible', async () => {
    await http()
      .post('/api/inventory/transfer')
      .set(auth(token))
      .send({ productId, fromBranchId: branchB, toBranchId: branchA, quantity: 50, notes: 'Exceso' })
      .expect(400);
  });

  let saleId: string;

  it('vende en el POS, calcula el IVA incluido y descuenta el stock', async () => {
    const res = await http()
      .post('/api/sales')
      .set(auth(token))
      .send({ branchId: branchA, items: [{ productId, quantity: 3, unitPrice: 10_000 }], payments: [{ type: 'cash', amount: 50_000 }] })
      .expect(201);
    saleId = res.body.data.id;
    expect(Number(res.body.data.total)).toBe(30_000);
    expect(Number(res.body.data.taxAmount)).toBeCloseTo(4_789.92, 2);
    expect(Number(res.body.data.changeGiven)).toBe(20_000);
    expect(await stockOf(branchA)).toBe(12);
  });

  it('rechaza una venta cuyo pago no cubre el total', async () => {
    const res = await http()
      .post('/api/sales')
      .set(auth(token))
      .send({ branchId: branchA, items: [{ productId, quantity: 1, unitPrice: 10_000 }], payments: [{ type: 'cash', amount: 1_000 }] })
      .expect(400);
    expect(res.body.message).toMatch(/no cubre el total/);
  });

  it('rechaza vender más unidades de las disponibles en la sede', async () => {
    await http()
      .post('/api/sales')
      .set(auth(token))
      .send({ branchId: branchB, items: [{ productId, quantity: 99, unitPrice: 10_000 }], payments: [{ type: 'card', amount: 990_000 }] })
      .expect(400);
  });

  it('anula la venta y devuelve las unidades al inventario', async () => {
    await http().patch(`/api/sales/${saleId}/void`).set(auth(token)).send({ reason: 'Prueba e2e' }).expect(200);
    expect(await stockOf(branchA)).toBe(15);
    await http().patch(`/api/sales/${saleId}/void`).set(auth(token)).send({ reason: 'Otra vez' }).expect(404);
  });

  it('crea, envía y recibe una orden de compra que suma inventario', async () => {
    const supplier = await http().post('/api/suppliers').set(auth(token)).send({ name: `Proveedor e2e ${Date.now()}` }).expect(201);
    const order = await http()
      .post('/api/purchases')
      .set(auth(token))
      .send({ branchId: branchB, supplierId: supplier.body.data.id, items: [{ productId, quantityOrdered: 10, unitCost: 6_000 }] })
      .expect(201);
    const id = order.body.data.id as string;
    await http().patch(`/api/purchases/${id}/send`).set(auth(token)).expect(200);

    const itemId = order.body.data.items[0].id as string;
    await http()
      .patch(`/api/purchases/${id}/receive`)
      .set(auth(token))
      .send({ items: [{ purchaseOrderItemId: itemId, quantityReceived: 10 }] })
      .expect(200);
    expect(await stockOf(branchB)).toBe(15);

    // No se puede recibir más de lo pedido
    await http()
      .patch(`/api/purchases/${id}/receive`)
      .set(auth(token))
      .send({ items: [{ purchaseOrderItemId: itemId, quantityReceived: 1 }] })
      .expect(404);
  });

  it('calcula el pronóstico de reposición y el resumen de analíticas', async () => {
    await http().get('/api/ai/predictions/stock').set(auth(token)).expect(200);
    const overview = await http().get('/api/analytics/overview').query({ days: 30 }).set(auth(token)).expect(200);
    expect(overview.body.data.kpis).toHaveProperty('grossMargin');
  });

  it('genera una copia de seguridad verificable de la empresa', async () => {
    const res = await http().post('/api/backup/create').set(auth(token)).expect(201);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
