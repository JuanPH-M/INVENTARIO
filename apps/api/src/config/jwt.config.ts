import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  privateKey: (process.env['JWT_PRIVATE_KEY'] ?? '').replace(/\\n/g, '\n'),
  publicKey: (process.env['JWT_PUBLIC_KEY'] ?? '').replace(/\\n/g, '\n'),
  expiresIn: process.env['JWT_EXPIRES_IN'] ?? '15m',
  refreshTokenExpiresIn: process.env['REFRESH_TOKEN_EXPIRES_IN'] ?? '7d',
  refreshTokenSecret: process.env['REFRESH_TOKEN_SECRET'] ?? 'change-me-in-production',
  algorithm: 'RS256' as const,
}));
