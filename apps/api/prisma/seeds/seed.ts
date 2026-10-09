import { PrismaClient } from '@prisma/client';
import { seedSaasPlans } from './saas-plans.seed';
import { seedCurrencies } from './currencies.seed';
import { seedPermissions } from './permissions.seed';
import { seedRoles } from './roles.seed';
import { seedDemoTenant } from './demo-tenant.seed';
import { seedDemoData } from './demo-data.seed';
import { seedInitialCompany } from './initial-company.seed';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('\n🌱 Starting database seed...\n');

  try {
    await seedSaasPlans(prisma);
    await seedCurrencies(prisma);
    await seedPermissions(prisma);
    await seedRoles(prisma);
    await seedDemoTenant(prisma);
    await seedDemoData(prisma);
    await seedInitialCompany(prisma);
    console.log('\n✅ Seed completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
