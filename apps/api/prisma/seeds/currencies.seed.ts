import { PrismaClient } from '@prisma/client';

export async function seedCurrencies(prisma: PrismaClient): Promise<void> {
  const currencies = [
    { code: 'COP', name: 'Peso Colombiano',      symbol: '$',   decimalPlaces: 0, isBase: false },
    { code: 'USD', name: 'Dólar Estadounidense',  symbol: 'US$', decimalPlaces: 2, isBase: true  },
    { code: 'EUR', name: 'Euro',                  symbol: '€',   decimalPlaces: 2, isBase: false },
    { code: 'MXN', name: 'Peso Mexicano',         symbol: '$',   decimalPlaces: 2, isBase: false },
    { code: 'PEN', name: 'Sol Peruano',           symbol: 'S/',  decimalPlaces: 2, isBase: false },
    { code: 'CLP', name: 'Peso Chileno',          symbol: '$',   decimalPlaces: 0, isBase: false },
    { code: 'ARS', name: 'Peso Argentino',        symbol: '$',   decimalPlaces: 2, isBase: false },
    { code: 'BRL', name: 'Real Brasileño',        symbol: 'R$',  decimalPlaces: 2, isBase: false },
    { code: 'VES', name: 'Bolívar Venezolano',    symbol: 'Bs.', decimalPlaces: 2, isBase: false },
    { code: 'GBP', name: 'Libra Esterlina',       symbol: '£',   decimalPlaces: 2, isBase: false },
  ];

  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: currency,
      create: currency,
    });
  }

  console.log(`✓ Currencies seeded (${currencies.length})`);
}
