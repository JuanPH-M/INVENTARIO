import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  migrate: {
    seed: {
      run: 'ts-node prisma/seeds/seed.ts',
    },
  },
});
