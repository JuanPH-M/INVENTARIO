import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

type MemoryEntry = { value: string; expiresAt: number };

const MEMORY_MAX_ENTRIES = 10_000;

/**
 * Cache con Redis como backend principal y un almacén en memoria como respaldo.
 *
 * Si Redis no está disponible la aplicación sigue funcionando: las escrituras
 * van a memoria (por proceso) y las lecturas críticas — como la lista negra de
 * sesiones — consultan ambos almacenes, de modo que una sesión revocada nunca
 * vuelve a ser válida por una caída de Redis.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client!: Redis;
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('redis.url') ?? 'redis://localhost:6379';
    this.client = new Redis(redisUrl, {
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: (times) => Math.min(times * 500, 10_000),
    });

    let warned = false;
    this.client.on('ready', () => {
      warned = false;
      this.logger.log('Redis connected');
    });
    this.client.on('error', (err) => {
      if (!warned) {
        this.logger.warn(`Redis unavailable, using in-memory cache: ${(err as Error).message}`);
        warned = true;
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  get isRedisReady(): boolean {
    return this.client?.status === 'ready';
  }

  // ── Almacén en memoria ──────────────────────────────────────────────

  private memGet(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  private memSet(key: string, value: string, ttlSeconds: number): void {
    if (this.memory.size >= MEMORY_MAX_ENTRIES) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) this.memory.delete(oldest);
    }
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  private memDelPattern(pattern: string): void {
    const regex = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    );
    for (const key of this.memory.keys()) {
      if (regex.test(key)) this.memory.delete(key);
    }
  }

  private parse<T>(value: string): T {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  // ── API pública ─────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    if (this.isRedisReady) {
      try {
        const value = await this.client.get(key);
        if (value !== null) return this.parse<T>(value);
      } catch {
        /* fallback a memoria */
      }
    }
    const mem = this.memGet(key);
    return mem === null ? null : this.parse<T>(mem);
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const ttl = ttlSeconds ?? this.config.get<number>('redis.ttlDefault') ?? 300;
    if (this.isRedisReady) {
      try {
        await this.client.setex(key, ttl, serialized);
        return;
      } catch {
        /* fallback a memoria */
      }
    }
    this.memSet(key, serialized, ttl);
  }

  async del(key: string): Promise<void> {
    this.memory.delete(key);
    if (!this.isRedisReady) return;
    try {
      await this.client.del(key);
    } catch {
      this.logger.warn(`Cache del failed for key: ${key}`);
    }
  }

  async delMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    keys.forEach((k) => this.memory.delete(k));
    if (!this.isRedisReady) return;
    try {
      await this.client.del(...keys);
    } catch {
      this.logger.warn(`Cache delMany failed for ${keys.length} keys`);
    }
  }

  /** Borra claves por patrón usando SCAN (no bloquea Redis como KEYS). */
  async invalidatePattern(pattern: string): Promise<void> {
    this.memDelPattern(pattern);
    if (!this.isRedisReady) return;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
        cursor = next;
        if (keys.length > 0) await this.client.del(...keys);
      } while (cursor !== '0');
    } catch {
      this.logger.warn(`Cache invalidatePattern failed for pattern: ${pattern}`);
    }
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async increment(key: string, by = 1): Promise<number> {
    if (this.isRedisReady) {
      try {
        return await this.client.incrby(key, by);
      } catch {
        /* fallback a memoria */
      }
    }
    const current = Number(this.memGet(key) ?? 0) + by;
    const entry = this.memory.get(key);
    const ttlLeft = entry ? Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000)) : 3600;
    this.memSet(key, String(current), ttlLeft);
    return current;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const mem = this.memGet(key);
    if (mem !== null) this.memSet(key, mem, ttlSeconds);
    if (!this.isRedisReady) return;
    try {
      await this.client.expire(key, ttlSeconds);
    } catch {
      this.logger.warn(`Cache expire failed for key: ${key}`);
    }
  }

  /** Comprueba ambos almacenes: una clave escrita durante una caída de Redis sigue contando. */
  async exists(key: string): Promise<boolean> {
    if (this.memGet(key) !== null) return true;
    if (!this.isRedisReady) return false;
    try {
      return (await this.client.exists(key)) === 1;
    } catch {
      return false;
    }
  }

  buildKey(...parts: string[]): string {
    return parts.join(':');
  }
}
