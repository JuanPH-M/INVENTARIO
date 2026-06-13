export const CACHE_KEYS = {
  USER_PERMISSIONS: (userId: string, branchId: string | null) =>
    `perm:${userId}:${branchId ?? 'global'}`,

  USER_PERMISSIONS_PATTERN: (userId: string) => `perm:${userId}:*`,

  TENANT_SETTINGS: (tenantId: string) => `tenant:${tenantId}:settings`,

  TENANT_PLAN: (tenantId: string) => `tenant:${tenantId}:plan`,

  EXCHANGE_RATE: (tenantId: string, from: string, to: string) =>
    `exrate:${tenantId}:${from}:${to}`,

  PRODUCT_STOCK: (tenantId: string, productId: string, branchId: string) =>
    `stock:${tenantId}:${productId}:${branchId}`,

  DASHBOARD_KPIS: (tenantId: string, branchId: string | null, date: string) =>
    `kpis:${tenantId}:${branchId ?? 'all'}:${date}`,

  TOKEN_BLACKLIST: (tokenId: string) => `blacklist:token:${tokenId}`,

  RATE_LIMIT_LOGIN: (identifier: string) => `ratelimit:login:${identifier}`,

  RATE_LIMIT_API: (userId: string) => `ratelimit:api:${userId}`,

  FAILED_LOGIN: (email: string) => `failedlogin:${email}`,

  CASH_REGISTER_SESSION: (branchId: string, registerId: string) =>
    `cashsession:${branchId}:${registerId}`,

  AI_INSIGHTS: (tenantId: string) => `ai:insights:${tenantId}`,

  STOCK_ALERTS: (tenantId: string) => `stockalerts:${tenantId}`,
} as const;

export const CACHE_TTL = {
  PERMISSIONS: 300,       // 5 min
  TENANT_SETTINGS: 600,   // 10 min
  EXCHANGE_RATE: 3600,    // 1 hora
  PRODUCT_STOCK: 60,      // 1 min
  DASHBOARD_KPIS: 300,    // 5 min
  RATE_LIMIT: 900,        // 15 min
  FAILED_LOGIN: 3600,     // 1 hora
  AI_INSIGHTS: 3600,      // 1 hora
  STOCK_ALERTS: 1800,     // 30 min
} as const;
