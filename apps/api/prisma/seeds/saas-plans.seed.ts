import { PrismaClient } from '@prisma/client';

export async function seedSaasPlans(prisma: PrismaClient): Promise<void> {
  const plans = [
    {
      name: 'Starter',
      slug: 'starter',
      description: 'Para pequeños negocios que están comenzando',
      priceMonthly: 29.99,
      priceAnnual: 299.99,
      currency: 'USD',
      maxBranches: 2,
      maxUsers: 5,
      maxProducts: 1000,
      maxStorageGb: 5,
      sortOrder: 1,
      features: {
        jewelry: false,
        pawnshop: false,
        ai: false,
        advancedReports: false,
        apiAccess: false,
        multiCurrency: false,
        cashRegister: true,
        clientManagement: true,
        documents: true,
        backup: false,
      },
    },
    {
      name: 'Business',
      slug: 'business',
      description: 'Para negocios en crecimiento con múltiples sucursales',
      priceMonthly: 79.99,
      priceAnnual: 799.99,
      currency: 'USD',
      maxBranches: 10,
      maxUsers: 25,
      maxProducts: 50000,
      maxStorageGb: 50,
      sortOrder: 2,
      features: {
        jewelry: true,
        pawnshop: true,
        ai: true,
        advancedReports: true,
        apiAccess: false,
        multiCurrency: true,
        cashRegister: true,
        clientManagement: true,
        documents: true,
        backup: true,
      },
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'Para grandes empresas sin límites',
      priceMonthly: 199.99,
      priceAnnual: 1999.99,
      currency: 'USD',
      maxBranches: -1,
      maxUsers: -1,
      maxProducts: -1,
      maxStorageGb: -1,
      sortOrder: 3,
      features: {
        jewelry: true,
        pawnshop: true,
        ai: true,
        advancedReports: true,
        apiAccess: true,
        multiCurrency: true,
        cashRegister: true,
        clientManagement: true,
        documents: true,
        backup: true,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.saasPlan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
  }

  console.log(`✓ SaaS plans seeded (${plans.length})`);
}
