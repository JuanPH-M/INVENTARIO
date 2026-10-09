import { PrismaClient } from '@prisma/client';

/**
 * Datos de demostración realistas para la empresa "Empresa Demo": una cadena de tiendas
 * con varias sedes, catálogo, proveedores, clientes, órdenes de compra y 60 días de ventas.
 * Es idempotente: si la empresa ya tiene ventas, no hace nada.
 */

const DAY = 86_400_000;

// Generador pseudoaleatorio determinista (los datos son iguales en cada instalación)
let seedState = 20260101;
function rand(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]!;
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
const round2 = (n: number) => Math.round(n * 100) / 100;

const BRANCHES = [
  { code: 'PRINCIPAL', name: 'Tienda Principal – Chapinero', city: 'Bogotá', street: 'Calle 63 #9-45', weight: 1.0 },
  { code: 'NORTE', name: 'Tienda Norte – Usaquén', city: 'Bogotá', street: 'Cra 7 #120-20', weight: 0.8 },
  { code: 'MEDELLIN', name: 'Tienda Medellín – El Poblado', city: 'Medellín', street: 'Cra 43A #7-50', weight: 0.7 },
  { code: 'BODEGA', name: 'Bodega Central', city: 'Bogotá', street: 'Av. Américas #68-94', weight: 0, type: 'warehouse' },
];

const SUPPLIERS = [
  { name: 'Distribuidora Andina S.A.S.', taxId: '900456123-4', contactName: 'Laura Gómez', phone: '+57 601 345 6789' },
  { name: 'TecnoImport Colombia', taxId: '901234567-1', contactName: 'Andrés Rojas', phone: '+57 604 222 3344' },
  { name: 'Textiles del Valle', taxId: '890321654-7', contactName: 'Camila Torres', phone: '+57 602 555 1020' },
  { name: 'Alimentos La Sabana', taxId: '860987654-2', contactName: 'Jorge Martínez', phone: '+57 601 777 8899' },
];

type DemoProduct = {
  code: string;
  name: string;
  category: string;
  supplier: number;
  cost: number;
  price: number;
  tax: number;
  brand?: string;
  popularity: number;
};

const PRODUCTS: DemoProduct[] = [
  { code: 'ELE-001', name: 'Audífonos inalámbricos Pro', category: 'electronicos', supplier: 1, cost: 85000, price: 149900, tax: 0.19, brand: 'SoundMax', popularity: 6 },
  { code: 'ELE-002', name: 'Cargador USB-C 30W', category: 'electronicos', supplier: 1, cost: 22000, price: 45900, tax: 0.19, brand: 'VoltX', popularity: 9 },
  { code: 'ELE-003', name: 'Parlante Bluetooth portátil', category: 'electronicos', supplier: 1, cost: 98000, price: 179900, tax: 0.19, brand: 'SoundMax', popularity: 4 },
  { code: 'ELE-004', name: 'Mouse inalámbrico ergonómico', category: 'electronicos', supplier: 1, cost: 31000, price: 64900, tax: 0.19, brand: 'Clicker', popularity: 7 },
  { code: 'ELE-005', name: 'Teclado mecánico compacto', category: 'electronicos', supplier: 1, cost: 145000, price: 259900, tax: 0.19, brand: 'Clicker', popularity: 3 },
  { code: 'ELE-006', name: 'Smartwatch deportivo', category: 'electronicos', supplier: 1, cost: 210000, price: 379900, tax: 0.19, brand: 'FitPulse', popularity: 3 },
  { code: 'ELE-007', name: 'Cable HDMI 2 m', category: 'electronicos', supplier: 1, cost: 9000, price: 24900, tax: 0.19, brand: 'VoltX', popularity: 8 },
  { code: 'ELE-008', name: 'Power bank 20.000 mAh', category: 'electronicos', supplier: 1, cost: 68000, price: 129900, tax: 0.19, brand: 'VoltX', popularity: 5 },
  { code: 'ROP-001', name: 'Camiseta algodón básica', category: 'ropa-accesorios', supplier: 2, cost: 18000, price: 39900, tax: 0.19, brand: 'Urbano', popularity: 9 },
  { code: 'ROP-002', name: 'Jean slim fit', category: 'ropa-accesorios', supplier: 2, cost: 52000, price: 119900, tax: 0.19, brand: 'Urbano', popularity: 6 },
  { code: 'ROP-003', name: 'Chaqueta impermeable', category: 'ropa-accesorios', supplier: 2, cost: 95000, price: 199900, tax: 0.19, brand: 'Andes', popularity: 3 },
  { code: 'ROP-004', name: 'Gorra bordada', category: 'ropa-accesorios', supplier: 2, cost: 15000, price: 34900, tax: 0.19, brand: 'Urbano', popularity: 6 },
  { code: 'ROP-005', name: 'Morral ejecutivo', category: 'ropa-accesorios', supplier: 2, cost: 72000, price: 149900, tax: 0.19, brand: 'Andes', popularity: 4 },
  { code: 'ROP-006', name: 'Medias deportivas x3', category: 'ropa-accesorios', supplier: 2, cost: 9500, price: 24900, tax: 0.19, brand: 'Urbano', popularity: 8 },
  { code: 'JOY-001', name: 'Anillo plata 925', category: 'joyeria', supplier: 0, cost: 65000, price: 149000, tax: 0.19, brand: 'Lumina', popularity: 3 },
  { code: 'JOY-002', name: 'Cadena oro laminado', category: 'joyeria', supplier: 0, cost: 48000, price: 109000, tax: 0.19, brand: 'Lumina', popularity: 3 },
  { code: 'JOY-003', name: 'Aretes de perla', category: 'joyeria', supplier: 0, cost: 35000, price: 89000, tax: 0.19, brand: 'Lumina', popularity: 4 },
  { code: 'ALI-001', name: 'Café de origen 500 g', category: 'alimentos', supplier: 3, cost: 16000, price: 28900, tax: 0.05, brand: 'Sierra Nevada', popularity: 10 },
  { code: 'ALI-002', name: 'Chocolate artesanal 70%', category: 'alimentos', supplier: 3, cost: 7000, price: 14900, tax: 0.05, brand: 'Cacao Vivo', popularity: 9 },
  { code: 'ALI-003', name: 'Miel de abejas 350 g', category: 'alimentos', supplier: 3, cost: 11000, price: 21900, tax: 0, brand: 'La Sabana', popularity: 6 },
  { code: 'ALI-004', name: 'Granola premium 400 g', category: 'alimentos', supplier: 3, cost: 9500, price: 18900, tax: 0.05, brand: 'La Sabana', popularity: 7 },
  { code: 'ALI-005', name: 'Té verde x20 sobres', category: 'alimentos', supplier: 3, cost: 5500, price: 12900, tax: 0.05, brand: 'Sierra Nevada', popularity: 5 },
];

const FIRST_NAMES = ['Ana', 'Luis', 'Sofía', 'Juan', 'Valentina', 'Mateo', 'Isabella', 'Santiago', 'Mariana', 'Daniel', 'Gabriela', 'Felipe', 'Natalia', 'Sebastián', 'Paula'];
const LAST_NAMES = ['García', 'Rodríguez', 'Martínez', 'López', 'Hernández', 'Gómez', 'Díaz', 'Moreno', 'Ramírez', 'Vargas', 'Castro', 'Ortiz'];

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  // En producción no hay datos demo; en pruebas automatizadas se omite por velocidad
  if (process.env['NODE_ENV'] === 'production' || process.env['NODE_ENV'] === 'test') return;

  const tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-empresa' } });
  if (!tenant) return;
  if ((await prisma.sale.count({ where: { tenantId: tenant.id } })) > 0) {
    console.log('✓ Datos de demostración ya existen, se omiten');
    return;
  }

  const tenantId = tenant.id;
  const cop = await prisma.currency.findUnique({ where: { code: 'COP' } });
  if (!cop) throw new Error('Moneda COP no encontrada');
  const admin = await prisma.user.findFirst({ where: { tenantId, email: 'admin@empresa.com' } });
  const seller = await prisma.user.findFirst({ where: { tenantId, email: 'vendedor@empresa.com' } });
  if (!admin || !seller) throw new Error('Usuarios demo no encontrados');
  const sellers = [admin.id, seller.id];

  // ── Sedes y cajas ─────────────────────────────────────────────────
  const branches = [];
  for (const b of BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: { tenantId_code: { tenantId, code: b.code } },
      update: { name: b.name, address: { street: b.street, city: b.city, country: 'Colombia' } },
      create: {
        tenantId,
        code: b.code,
        name: b.name,
        type: b.type ?? 'physical',
        address: { street: b.street, city: b.city, country: 'Colombia' },
        isActive: true,
      },
    });
    branches.push({ ...b, id: branch.id });
    if (b.weight > 0) {
      await prisma.cashRegister.upsert({
        where: { tenantId_branchId_code: { tenantId, branchId: branch.id, code: 'CAJA-01' } },
        update: {},
        create: { tenantId, branchId: branch.id, name: 'Caja 1', code: 'CAJA-01', isActive: true },
      });
    }
  }
  const stores = branches.filter((b) => b.weight > 0);
  const warehouse = branches.find((b) => b.code === 'BODEGA')!;

  // ── Proveedores ───────────────────────────────────────────────────
  const suppliers = [];
  for (const s of SUPPLIERS) {
    const existing = await prisma.supplier.findFirst({ where: { tenantId, name: s.name } });
    suppliers.push(
      existing ??
        (await prisma.supplier.create({
          data: { tenantId, ...s, email: `ventas@${s.name.split(' ')[0]!.toLowerCase()}.com.co`, paymentTerms: 30, currency: 'COP' },
        })),
    );
  }

  // ── Productos ─────────────────────────────────────────────────────
  const categories = await prisma.category.findMany({ where: { tenantId }, select: { id: true, slug: true } });
  const categoryId = (slug: string) => categories.find((c) => c.slug === slug)?.id;

  const products = [];
  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { tenantId_internalCode: { tenantId, internalCode: p.code } },
      update: {},
      create: {
        tenantId,
        internalCode: p.code,
        sku: p.code,
        barcode: `770${String(1000000000 + PRODUCTS.indexOf(p) * 7919).slice(0, 10)}`,
        name: p.name,
        brand: p.brand,
        categoryId: categoryId(p.category),
        supplierId: suppliers[p.supplier]!.id,
        costPrice: p.cost,
        salePrice: p.price,
        minSalePrice: Math.round(p.cost * 1.05),
        taxRate: p.tax,
        taxIncluded: true,
        trackInventory: true,
        minStock: 5,
        reorderPoint: Math.max(6, p.popularity * 2),
        maxStock: 200,
        status: 'active',
        createdById: admin.id,
      },
    });
    products.push({ ...p, id: product.id });
  }

  // ── Stock inicial por sede (recepción de la orden de compra inicial) ─
  const stock = new Map<string, number>();
  const key = (productId: string, branchId: string) => `${productId}:${branchId}`;
  const start = new Date(Date.now() - 62 * DAY);

  for (const branch of branches) {
    const order = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        branchId: branch.id,
        supplierId: suppliers[0]!.id,
        currencyId: cop.id,
        orderNumber: `OC${start.getFullYear()}-${String(branches.indexOf(branch) + 1).padStart(6, '0')}`,
        status: 'received',
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        paymentStatus: 'paid',
        receivedDate: start,
        notes: 'Inventario inicial de apertura',
        createdById: admin.id,
        createdAt: start,
      },
    });

    let total = 0;
    for (const p of products) {
      const qty = branch.code === 'BODEGA' ? between(80, 160) : Math.round(p.popularity * between(5, 8) * branch.weight) + between(5, 15);
      total += qty * p.cost;
      await prisma.purchaseOrderItem.create({
        data: { purchaseOrderId: order.id, productId: p.id, quantityOrdered: qty, quantityReceived: qty, unitCost: p.cost, subtotal: qty * p.cost },
      });
      await prisma.inventoryStock.upsert({
        where: { tenantId_productId_branchId: { tenantId, productId: p.id, branchId: branch.id } },
        update: { quantity: qty },
        create: { tenantId, productId: p.id, branchId: branch.id, quantity: qty, reserved: 0 },
      });
      await prisma.inventoryMovement.create({
        data: {
          tenantId, productId: p.id, branchId: branch.id, type: 'purchase_in', quantity: qty, direction: 1,
          stockBefore: 0, stockAfter: qty, unitCost: p.cost, referenceType: 'purchase_order', referenceId: order.id,
          performedById: admin.id, performedAt: start,
        },
      });
      stock.set(key(p.id, branch.id), qty);
    }
    await prisma.purchaseOrder.update({ where: { id: order.id }, data: { subtotal: total, total } });
    await prisma.financialTransaction.create({
      data: {
        tenantId, branchId: branch.id, type: 'expense', description: `Compra inicial ${branch.name}`,
        amount: total, currency: 'COP', referenceType: 'purchase_order', referenceId: order.id, transactionDate: start, createdById: admin.id,
      },
    });
  }

  // ── Clientes ──────────────────────────────────────────────────────
  const clients = [];
  for (let i = 0; i < 18; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const lastName = pick(LAST_NAMES);
    const idNumber = String(1010000000 + i * 3571);
    const client = await prisma.client.upsert({
      where: { tenantId_idType_idNumber: { tenantId, idType: 'CC', idNumber } },
      update: {},
      create: {
        tenantId, type: 'individual', status: 'active', firstName, lastName, idType: 'CC', idNumber,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@correo.com`,
        phone: `+57 3${between(10, 23)} ${between(100, 999)} ${between(1000, 9999)}`,
      },
    });
    clients.push(client.id);
  }

  // ── 60 días de ventas ─────────────────────────────────────────────
  const counters = new Map<number, number>();
  const popularityPool = products.flatMap((p) => Array.from({ length: p.popularity }, () => p));
  let salesCreated = 0;

  for (let d = 60; d >= 0; d--) {
    const day = new Date(Date.now() - d * DAY);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const growth = 1 + (60 - d) / 120; // tendencia de crecimiento

    for (const store of stores) {
      const salesToday = Math.round(between(3, 7) * store.weight * growth * (weekend ? 1.4 : 1));
      for (let s = 0; s < salesToday; s++) {
        const createdAt = new Date(day);
        createdAt.setHours(between(9, 19), between(0, 59), between(0, 59), 0);
        if (createdAt.getTime() > Date.now()) continue;

        const lines = new Map<string, { p: (typeof products)[number]; qty: number }>();
        for (let l = 0; l < between(1, 3); l++) {
          const p = pick(popularityPool);
          const available = stock.get(key(p.id, store.id)) ?? 0;
          const current = lines.get(p.id)?.qty ?? 0;
          if (available - current >= 1) lines.set(p.id, { p, qty: current + 1 + (rand() < 0.2 ? 1 : 0) });
        }
        const items = [...lines.values()].filter(({ p, qty }) => (stock.get(key(p.id, store.id)) ?? 0) >= qty);
        if (items.length === 0) continue;

        let subtotal = 0;
        let taxAmount = 0;
        const itemRows = items.map(({ p, qty }) => {
          const lineTotal = qty * p.price;
          const net = round2(lineTotal / (1 + p.tax));
          subtotal += net;
          taxAmount += lineTotal - net;
          return { productId: p.id, productName: p.name, productCode: p.code, quantity: qty, unitPrice: p.price, taxRate: p.tax, discount: 0, subtotal: lineTotal };
        });
        const total = round2(subtotal + taxAmount);
        const year = createdAt.getFullYear();
        const n = (counters.get(year) ?? 0) + 1;
        counters.set(year, n);
        const paymentType = rand() < 0.55 ? 'cash' : rand() < 0.7 ? 'card' : 'transfer';
        const paid = paymentType === 'cash' ? Math.ceil(total / 10000) * 10000 : total;

        const sale = await prisma.sale.create({
          data: {
            tenantId, branchId: store.id, clientId: rand() < 0.45 ? pick(clients) : null, currencyId: cop.id,
            saleNumber: `V${year}-${String(n).padStart(6, '0')}`, type: 'sale', status: 'completed',
            subtotal: round2(subtotal), taxAmount: round2(taxAmount), discount: 0, total, amountPaid: total,
            changeGiven: round2(paid - total), soldById: pick(sellers), createdAt,
            items: { create: itemRows },
            payments: { create: [{ tenantId, type: paymentType, amount: paid, status: 'completed', processedById: admin.id, processedAt: createdAt }] },
          },
        });

        for (const { p, qty } of items) {
          const before = stock.get(key(p.id, store.id)) ?? 0;
          stock.set(key(p.id, store.id), before - qty);
          await prisma.inventoryMovement.create({
            data: {
              tenantId, productId: p.id, branchId: store.id, type: 'sale_out', quantity: qty, direction: -1,
              stockBefore: before, stockAfter: before - qty, unitCost: p.cost, referenceType: 'sale', referenceId: sale.id,
              performedById: admin.id, performedAt: createdAt,
            },
          });
        }
        await prisma.financialTransaction.create({
          data: {
            tenantId, branchId: store.id, type: 'income', description: `Venta #${sale.saleNumber}`,
            amount: total, currency: 'COP', referenceType: 'sale', referenceId: sale.id, transactionDate: createdAt, createdById: admin.id,
          },
        });
        salesCreated++;
      }
    }

    // Reposición semanal desde la bodega central hacia las tiendas
    if (d % 7 === 0 && d > 0) {
      for (const store of stores) {
        for (const p of products) {
          const current = stock.get(key(p.id, store.id)) ?? 0;
          const fromQty = stock.get(key(p.id, warehouse.id)) ?? 0;
          const need = Math.max(0, p.popularity * 3 - current);
          const qty = Math.min(need, fromQty);
          if (qty <= 0) continue;
          stock.set(key(p.id, warehouse.id), fromQty - qty);
          stock.set(key(p.id, store.id), current + qty);
          await prisma.inventoryMovement.createMany({
            data: [
              { tenantId, productId: p.id, branchId: warehouse.id, type: 'transfer_out', quantity: qty, direction: -1, stockBefore: fromQty, stockAfter: fromQty - qty, referenceType: 'transfer', notes: `Traslado a ${store.name}`, performedById: admin.id, performedAt: day },
              { tenantId, productId: p.id, branchId: store.id, type: 'transfer_in', quantity: qty, direction: 1, stockBefore: current, stockAfter: current + qty, referenceType: 'transfer', notes: `Traslado desde ${warehouse.name}`, performedById: admin.id, performedAt: day },
            ],
          });
        }
      }
    }
  }

  // Persistir el stock final calculado
  for (const [k, qty] of stock) {
    const [productId, branchId] = k.split(':') as [string, string];
    await prisma.inventoryStock.update({
      where: { tenantId_productId_branchId: { tenantId, productId, branchId } },
      data: { quantity: qty },
    });
  }

  // Totales acumulados por cliente
  const byClient = await prisma.sale.groupBy({ by: ['clientId'], where: { tenantId, clientId: { not: null } }, _sum: { total: true }, _max: { createdAt: true } });
  for (const c of byClient) {
    if (!c.clientId) continue;
    await prisma.client.update({ where: { id: c.clientId }, data: { totalSales: c._sum.total ?? 0, lastActivityAt: c._max.createdAt } });
  }

  // Una orden de compra pendiente para mostrar el flujo de recepción
  const pending = products.filter((p) => p.popularity >= 8).slice(0, 4);
  const poTotal = pending.reduce((s, p) => s + p.cost * 40, 0);
  await prisma.purchaseOrder.create({
    data: {
      tenantId, branchId: warehouse.id, supplierId: suppliers[3]!.id, currencyId: cop.id,
      orderNumber: `OC${new Date().getFullYear()}-000100`, status: 'sent', subtotal: poTotal, taxAmount: 0, total: poTotal,
      expectedDate: new Date(Date.now() + 3 * DAY), notes: 'Reposición de productos de alta rotación', createdById: admin.id,
      items: { create: pending.map((p) => ({ productId: p.id, quantityOrdered: 40, unitCost: p.cost, subtotal: p.cost * 40 })) },
    },
  });

  console.log(`✓ Datos de demostración: ${stores.length} tiendas + bodega, ${products.length} productos, ${clients.length} clientes, ${salesCreated} ventas`);
}
