import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  ttlDefault: parseInt(process.env['REDIS_TTL_DEFAULT'] ?? '300', 10),
}));
