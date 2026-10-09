import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Primera empresa y su administrador en una instalación nueva (producción).
 * Se ejecuta solo si se definen INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD y ese
 * usuario todavía no existe. Es seguro ejecutarlo en cada arranque.
 *
 *   INITIAL_COMPANY_NAME="Mi Cadena S.A.S."
 *   INITIAL_COMPANY_SLUG="mi-cadena"          (opcional)
 *   INITIAL_BRANCH_NAME="Sede principal"       (opcional)
 *   INITIAL_ADMIN_EMAIL="gerencia@micadena.com"
 *   INITIAL_ADMIN_PASSWORD="UnaClaveSegura123"
 *   INITIAL_ADMIN_NAME="Ana Gerente"           (opcional)
 */
export async function seedInitialCompany(prisma: PrismaClient): Promise<void> {
  const email = process.env['INITIAL_ADMIN_EMAIL']?.trim().toLowerCase();
  const password = process.env['INITIAL_ADMIN_PASSWORD'];
  if (!email || !password) return;

  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error('INITIAL_ADMIN_PASSWORD debe tener 8+ caracteres con mayúscula, minúscula y número');
  }

  if (await prisma.user.findFirst({ where: { email } })) {
    console.log(`✓ Administrador inicial ${email} ya existe`);
    return;
  }

  const companyName = process.env['INITIAL_COMPANY_NAME'] ?? 'Mi Empresa';
  const slug =
    process.env['INITIAL_COMPANY_SLUG'] ??
    companyName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const plan = await prisma.saasPlan.findUnique({ where: { slug: 'enterprise' } });
  const currency = await prisma.currency.findUnique({ where: { code: process.env['INITIAL_CURRENCY'] ?? 'COP' } });
  const adminRole = await prisma.role.findFirst({ where: { slug: 'admin_general', tenantId: null } });
  if (!plan || !currency || !adminRole) throw new Error('Ejecuta primero los seeds base (planes, divisas, roles)');

  const [firstName, ...rest] = (process.env['INITIAL_ADMIN_NAME'] ?? 'Administrador General').split(' ');

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: companyName,
        slug,
        email,
        status: 'active',
        planId: plan.id,
        settings: { timezone: process.env['TZ'] ?? 'America/Bogota', locale: 'es-CO', currency: currency.code },
      },
    });
    await tx.saasSubscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: 'active', billingCycle: 'annual', startedAt: new Date() },
    });
    await tx.tenantCurrency.create({ data: { tenantId: tenant.id, currencyId: currency.id, isDefault: true } });
    const branch = await tx.branch.create({
      data: { tenantId: tenant.id, name: process.env['INITIAL_BRANCH_NAME'] ?? 'Sede principal', code: 'PRINCIPAL', isActive: true },
    });
    await tx.cashRegister.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'Caja 1', code: 'CAJA-01', isActive: true } });
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        firstName: firstName ?? 'Administrador',
        lastName: rest.join(' ') || 'General',
        status: 'active',
        emailVerifiedAt: new Date(),
      },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: adminRole.id } });
  });

  console.log(`✓ Empresa "${companyName}" creada con el administrador ${email}`);
}
