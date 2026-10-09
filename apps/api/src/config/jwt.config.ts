import { registerAs } from '@nestjs/config';

/**
 * Normaliza una clave PEM escrita en una sola línea del .env. Acepta saltos de línea
 * escritos como "\n" o "\\n", retornos de carro de Windows y comillas envolventes.
 */
export function normalizePem(raw: string | undefined): string {
  if (!raw) return '';
  const lines = raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\r/g, '')
    .replace(/\r/g, '')
    .split(/\\+n|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

/**
 * Producción: RS256 con par de claves (JWT_PRIVATE_KEY / JWT_PUBLIC_KEY).
 * Desarrollo sin claves: HS256 con JWT_DEV_SECRET (firma y verificación usan el mismo valor).
 */
export default registerAs('jwt', () => ({
  privateKey: normalizePem(process.env['JWT_PRIVATE_KEY']),
  publicKey: normalizePem(process.env['JWT_PUBLIC_KEY']),
  devSecret: process.env['JWT_DEV_SECRET'] ?? 'inventario-dev-only-secret',
  expiresIn: process.env['JWT_EXPIRES_IN'] ?? '15m',
  refreshTokenExpiresIn: process.env['REFRESH_TOKEN_EXPIRES_IN'] ?? '7d',
}));
