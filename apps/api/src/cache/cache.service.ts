import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('redis.url') ?? 'redis://localhost:6379';
    this.client = new Redis(redisUrl, {
      lazyConnect: false,
      enableOfflineQueue: false, // fail fast when disconnected instead of queuing
      maxRetriesPerRequest: 0,   // don't retry — fallback values are returned immediately
      retryStrategy: (times) => Math.min(times * 500, 10_000),
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.warn(`Redis unavailable: ${(err as Error).message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const ttl = ttlSeconds ?? (this.config.get<number>('redis.ttlDefault') ?? 300);
      await this.client.setex(key, ttl, serialized);
    } catch {
      this.logger.warn(`Cache set failed for key: ${key}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      this.logger.warn(`Cache del failed for key: ${key}`);
    }
  }

  async delMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      this.logger.warn(`Cache delMany failed for ${keys.length} keys`);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch {
      this.logger.warn(`Cache invalidatePattern failed for pattern: ${pattern}`);
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) return cached;
      const value = await factory();
      await this.set(key, value, ttlSeconds);
      return value;
    } catch {
      // Redis unavailable — run factory without caching
      return factory();
    }
  }

  async increment(key: string, by = 1): Promise<number> {
    try {
      return await this.client.incrby(key, by);
    } catch {
      return 0;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlSeconds);
    } catch {
      this.logger.warn(`Cache expire failed for key: ${key}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch {
      // Redis unavailable — assume key does not exist (safe default: don't block access)
      return false;
    }
  }

  async setAdd(key: string, member: string, ttlSeconds?: number): Promise<void> {
    try {
      await this.client.sadd(key, member);
      if (ttlSeconds) await this.client.expire(key, ttlSeconds);
    } catch {
      this.logger.warn(`Cache setAdd failed for key: ${key}`);
    }
  }

  async setIsMember(key: string, member: string): Promise<boolean> {
    try {
      return (await this.client.sismember(key, member)) === 1;
    } catch {
      return false;
    }
  }

  buildKey(...parts: string[]): string {
    return parts.join(':');
  }
}
