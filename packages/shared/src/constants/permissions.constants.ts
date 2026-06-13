export const PERMISSIONS = {
  // ── AUTH ──────────────────────────────────────────────────
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_MFA_MANAGE: 'auth:mfa:manage',

  // ── USERS ─────────────────────────────────────────────────
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  USERS_SUSPEND: 'users:suspend',
  USERS_ASSIGN_ROLES: 'users:assign_roles',
  USERS_RESET_PASSWORD: 'users:reset_password',
  USERS_EXPORT: 'users:export',

  // ── ROLES ─────────────────────────────────────────────────
  ROLES_READ: 'roles:read',
  ROLES_CREATE: 'roles:create',
  ROLES_UPDATE: 'roles:update',
  ROLES_DELETE: 'roles:delete',
  ROLES_ASSIGN_PERMISSIONS: 'roles:assign_permissions',

  // ── COMPANIES ─────────────────────────────────────────────
  COMPANIES_READ: 'companies:read',
  COMPANIES_CREATE: 'companies:create',
  COMPANIES_UPDATE: 'companies:update',
  COMPANIES_DELETE: 'companies:delete',
  COMPANIES_MANAGE_SETTINGS: 'companies:manage_settings',

  // ── BRANCHES ──────────────────────────────────────────────
  BRANCHES_READ: 'branches:read',
  BRANCHES_CREATE: 'branches:create',
  BRANCHES_UPDATE: 'branches:update',
  BRANCHES_DELETE: 'branches:delete',

  // ── CATEGORIES ────────────────────────────────────────────
  CATEGORIES_READ: 'categories:read',
  CATEGORIES_CREATE: 'categories:create',
  CATEGORIES_UPDATE: 'categories:update',
  CATEGORIES_DELETE: 'categories:delete',

  // ── SUPPLIERS ─────────────────────────────────────────────
  SUPPLIERS_READ: 'suppliers:read',
  SUPPLIERS_CREATE: 'suppliers:create',
  SUPPLIERS_UPDATE: 'suppliers:update',
  SUPPLIERS_DELETE: 'suppliers:delete',
  SUPPLIERS_EXPORT: 'suppliers:export',

  // ── PRODUCTS ──────────────────────────────────────────────
  PRODUCTS_READ: 'products:read',
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_UPDATE: 'products:update',
  PRODUCTS_DELETE: 'products:delete',
  PRODUCTS_PRICING: 'products:pricing',
  PRODUCTS_IMPORT: 'products:import',
  PRODUCTS_EXPORT: 'products:export',
  PRODUCTS_MANAGE_IMAGES: 'products:manage_images',
  PRODUCTS_MANAGE_DOCUMENTS: 'products:manage_documents',
  PRODUCTS_VIEW_TIMELINE: 'products:view_timeline',

  // ── JEWELRY ───────────────────────────────────────────────
  JEWELRY_READ: 'jewelry:read',
  JEWELRY_MANAGE: 'jewelry:manage',
  JEWELRY_APPRAISE: 'jewelry:appraise',
  JEWELRY_CONTRACT: 'jewelry:contract',

  // ── INVENTORY ─────────────────────────────────────────────
  INVENTORY_READ: 'inventory:read',
  INVENTORY_ADJUST: 'inventory:adjust',
  INVENTORY_TRANSFER: 'inventory:transfer',
  INVENTORY_COUNT: 'inventory:count',
  INVENTORY_EXPORT: 'inventory:export',

  // ── PURCHASES ─────────────────────────────────────────────
  PURCHASES_READ: 'purchases:read',
  PURCHASES_CREATE: 'purchases:create',
  PURCHASES_UPDATE: 'purchases:update',
  PURCHASES_DELETE: 'purchases:delete',
  PURCHASES_APPROVE: 'purchases:approve',
  PURCHASES_RECEIVE: 'purchases:receive',
  PURCHASES_EXPORT: 'purchases:export',

  // ── SALES ─────────────────────────────────────────────────
  SALES_READ: 'sales:read',
  SALES_CREATE: 'sales:create',
  SALES_UPDATE: 'sales:update',
  SALES_VOID: 'sales:void',
  SALES_DISCOUNT: 'sales:discount',
  SALES_RETURN: 'sales:return',
  SALES_EXPORT: 'sales:export',

  // ── CLIENTS ───────────────────────────────────────────────
  CLIENTS_READ: 'clients:read',
  CLIENTS_CREATE: 'clients:create',
  CLIENTS_UPDATE: 'clients:update',
  CLIENTS_DELETE: 'clients:delete',
  CLIENTS_VIEW_HISTORY: 'clients:view_history',
  CLIENTS_MANAGE_CREDIT: 'clients:manage_credit',
  CLIENTS_EXPORT: 'clients:export',
  CLIENTS_ADD_NOTES: 'clients:add_notes',

  // ── DOCUMENTS ─────────────────────────────────────────────
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_CREATE: 'documents:create',
  DOCUMENTS_UPDATE: 'documents:update',
  DOCUMENTS_DELETE: 'documents:delete',
  DOCUMENTS_SIGN: 'documents:sign',
  DOCUMENTS_EXPORT: 'documents:export',

  // ── CASH REGISTER ─────────────────────────────────────────
  CASH_REGISTER_READ: 'cash_register:read',
  CASH_REGISTER_OPEN: 'cash_register:open',
  CASH_REGISTER_CLOSE: 'cash_register:close',
  CASH_REGISTER_MOVEMENTS: 'cash_register:movements',
  CASH_REGISTER_RECONCILE: 'cash_register:reconcile',
  CASH_REGISTER_MANAGE: 'cash_register:manage',

  // ── FINANCE ───────────────────────────────────────────────
  FINANCE_READ: 'finance:read',
  FINANCE_CREATE: 'finance:create',
  FINANCE_UPDATE: 'finance:update',
  FINANCE_DELETE: 'finance:delete',
  FINANCE_CLOSE_PERIOD: 'finance:close_period',
  FINANCE_EXPORT: 'finance:export',

  // ── SUBSCRIPTIONS ─────────────────────────────────────────
  SUBSCRIPTIONS_READ: 'subscriptions:read',
  SUBSCRIPTIONS_CREATE: 'subscriptions:create',
  SUBSCRIPTIONS_UPDATE: 'subscriptions:update',
  SUBSCRIPTIONS_DELETE: 'subscriptions:delete',

  // ── CALENDAR ──────────────────────────────────────────────
  CALENDAR_READ: 'calendar:read',
  CALENDAR_CREATE: 'calendar:create',
  CALENDAR_UPDATE: 'calendar:update',
  CALENDAR_DELETE: 'calendar:delete',

  // ── ASSETS ────────────────────────────────────────────────
  ASSETS_READ: 'assets:read',
  ASSETS_CREATE: 'assets:create',
  ASSETS_UPDATE: 'assets:update',
  ASSETS_DELETE: 'assets:delete',
  ASSETS_MANAGE_MAINTENANCE: 'assets:manage_maintenance',
  ASSETS_EXPORT: 'assets:export',

  // ── INCIDENTS ─────────────────────────────────────────────
  INCIDENTS_READ: 'incidents:read',
  INCIDENTS_CREATE: 'incidents:create',
  INCIDENTS_UPDATE: 'incidents:update',
  INCIDENTS_DELETE: 'incidents:delete',
  INCIDENTS_ASSIGN: 'incidents:assign',
  INCIDENTS_CLOSE: 'incidents:close',
  INCIDENTS_EXPORT: 'incidents:export',

  // ── NOTIFICATIONS ─────────────────────────────────────────
  NOTIFICATIONS_READ: 'notifications:read',
  NOTIFICATIONS_MANAGE: 'notifications:manage',
  NOTIFICATIONS_SEND_BULK: 'notifications:send_bulk',

  // ── REPORTS ───────────────────────────────────────────────
  REPORTS_READ: 'reports:read',
  REPORTS_GENERATE: 'reports:generate',
  REPORTS_SCHEDULE: 'reports:schedule',
  REPORTS_EXPORT: 'reports:export',

  // ── ANALYTICS ─────────────────────────────────────────────
  ANALYTICS_READ: 'analytics:read',
  ANALYTICS_ADVANCED: 'analytics:advanced',

  // ── AI ────────────────────────────────────────────────────
  AI_READ: 'ai:read',
  AI_CHAT: 'ai:chat',
  AI_PREDICTIONS: 'ai:predictions',

  // ── AUDIT ─────────────────────────────────────────────────
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',

  // ── CURRENCY ──────────────────────────────────────────────
  CURRENCY_READ: 'currency:read',
  CURRENCY_MANAGE: 'currency:manage',

  // ── BACKUP ────────────────────────────────────────────────
  BACKUP_READ: 'backup:read',
  BACKUP_CREATE: 'backup:create',
  BACKUP_DOWNLOAD: 'backup:download',
  BACKUP_RESTORE: 'backup:restore',

  // ── SETTINGS ──────────────────────────────────────────────
  SETTINGS_READ: 'settings:read',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_MANAGE_INTEGRATIONS: 'settings:manage_integrations',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const PERMISSION_MODULES = {
  AUTH: 'auth',
  USERS: 'users',
  ROLES: 'roles',
  COMPANIES: 'companies',
  BRANCHES: 'branches',
  CATEGORIES: 'categories',
  SUPPLIERS: 'suppliers',
  PRODUCTS: 'products',
  JEWELRY: 'jewelry',
  INVENTORY: 'inventory',
  PURCHASES: 'purchases',
  SALES: 'sales',
  CLIENTS: 'clients',
  DOCUMENTS: 'documents',
  CASH_REGISTER: 'cash_register',
  FINANCE: 'finance',
  SUBSCRIPTIONS: 'subscriptions',
  CALENDAR: 'calendar',
  ASSETS: 'assets',
  INCIDENTS: 'incidents',
  NOTIFICATIONS: 'notifications',
  REPORTS: 'reports',
  ANALYTICS: 'analytics',
  AI: 'ai',
  AUDIT: 'audit',
  CURRENCY: 'currency',
  BACKUP: 'backup',
  SETTINGS: 'settings',
} as const;
