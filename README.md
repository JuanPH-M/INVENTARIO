# Inventario SaaS

Sistema de gestión de inventarios multisucursal para empresas. Monorepo con backend NestJS y frontend Next.js.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS 11 (Node.js 20) |
| Frontend | Next.js 15 (React 19) |
| Base de datos | PostgreSQL 16 |
| Cache / Sesiones | Redis 7 |
| ORM | Prisma v6 |
| Autenticación | JWT RS256 + HttpOnly cookies |
| Package manager | pnpm 9 + Turbo (monorepo) |
| Estilos | Tailwind CSS v4 + shadcn/ui |
| Contenerización | Docker + Docker Compose |

---

## Usuarios del sistema (seed de desarrollo)

Estos usuarios se crean automáticamente al ejecutar `pnpm prisma:seed`.

| Nombre | Email | Contraseña | Rol |
|--------|-------|-----------|-----|
| Super Admin | `admin@inventario.dev` | `Admin123!` | super_admin (plataforma) |
| Admin Demo | `admin@empresa.com` | `Demo123!` | admin_general |
| Vendedor Demo | `vendedor@empresa.com` | `Demo123!` | seller |
| Supervisor Demo | `supervisor@empresa.com` | `Demo123!` | supervisor |

> **Nota:** Estos usuarios solo se crean cuando `NODE_ENV !== 'production'`. En producción debes crear el superadmin manualmente configurando `SUPER_ADMIN_EMAIL` y `SUPER_ADMIN_PASSWORD` en el `.env`.

---

## Requisitos previos

- **Node.js** 20 o superior
- **pnpm** 9 o superior: `npm install -g pnpm`
- **PostgreSQL 16** instalado y corriendo localmente
- **Redis** (opcional — la app funciona sin Redis con degradación graceful)
- **OpenSSL** (para generar claves RSA de JWT)
- **Docker** (solo para despliegue en producción)

---

## Instalación y configuración inicial

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Generar el cliente de Prisma

```bash
pnpm --filter=@inventario/api prisma:generate
```

### 3. Configurar variables de entorno

Copia el archivo de ejemplo y edítalo:

```bash
cp apps/api/.env.development.example apps/api/.env
```

Edita `apps/api/.env` y completa:
- `DATABASE_URL` con tu conexión de PostgreSQL
- `JWT_PRIVATE_KEY` y `JWT_PUBLIC_KEY` (ver sección de claves RSA)

### 4. Generar claves RSA para JWT

```bash
# Generar clave privada
openssl genrsa -out private.pem 2048

# Extraer clave pública
openssl rsa -in private.pem -pubout -out public.pem

# Obtener el formato de una línea para el .env (Windows PowerShell)
node -e "
const fs = require('fs');
const priv = fs.readFileSync('private.pem','utf8').replace(/\r/g,'').split('\n').join('\\\n');
const pub  = fs.readFileSync('public.pem','utf8').replace(/\r/g,'').split('\n').join('\\\n');
console.log('JWT_PRIVATE_KEY=' + priv);
console.log('JWT_PUBLIC_KEY='  + pub);
"

# Eliminar archivos PEM (no deben subirse a git)
Remove-Item private.pem, public.pem
```

Pega los valores generados en `apps/api/.env`.

### 5. Ejecutar migraciones

```bash
pnpm --filter=@inventario/api prisma:migrate
```

### 6. Poblar la base de datos (seed)

```bash
pnpm --filter=@inventario/api prisma:seed
```

Esto crea los planes SaaS, monedas, permisos, roles y los usuarios de demo listados arriba.

---

## Comandos de desarrollo

```bash
# Iniciar todo el monorepo (API en :3001 + Web en :3000)
pnpm dev

# Solo la API
pnpm --filter=@inventario/api dev

# Solo el frontend
pnpm --filter=@inventario/web dev

# Build de producción
pnpm build

# Verificación de tipos TypeScript
pnpm typecheck

# Linter
pnpm lint

# Formatear código con Prettier
pnpm format
```

---

## Comandos de tests

```bash
# Ejecutar todos los tests de la API
pnpm test --filter=@inventario/api

# Tests en modo watch
pnpm --filter=@inventario/api test:watch

# Tests con cobertura
pnpm --filter=@inventario/api test:cov

# Tests e2e
pnpm --filter=@inventario/api test:e2e
```

---

## Comandos de Prisma

```bash
# Generar cliente Prisma (después de cambios en schema.prisma)
pnpm --filter=@inventario/api prisma:generate

# Crear y aplicar nueva migración (desarrollo)
pnpm --filter=@inventario/api prisma:migrate

# Aplicar migraciones en producción (sin modo interactivo)
pnpm --filter=@inventario/api run prisma:migrate:prod

# Seed — poblar base de datos con datos iniciales
pnpm --filter=@inventario/api prisma:seed

# Abrir Prisma Studio (GUI de base de datos en :5555)
pnpm --filter=@inventario/api prisma:studio
```

---

## URLs en desarrollo

| Servicio | URL |
|----------|-----|
| Frontend (web) | http://localhost:3000 |
| API REST | http://localhost:3001/api |
| Swagger / Docs | http://localhost:3001/api/docs |
| Prisma Studio | http://localhost:5555 |

---

## Estructura del proyecto

```
INVENTARIO/
├── apps/
│   ├── api/                    # Backend NestJS 11
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # 48 modelos de base de datos
│   │   │   └── seeds/          # Datos iniciales (planes, roles, demo)
│   │   └── src/
│   │       ├── modules/        # Módulos de negocio
│   │       │   ├── auth/       # Autenticación JWT + MFA
│   │       │   ├── users/      # Gestión de usuarios
│   │       │   ├── roles/      # Roles y permisos
│   │       │   ├── products/   # Catálogo de productos
│   │       │   ├── inventory/  # Control de inventario
│   │       │   ├── sales/      # Punto de venta
│   │       │   ├── purchases/  # Órdenes de compra
│   │       │   ├── clients/    # CRM clientes
│   │       │   ├── finance/    # Finanzas y reportes
│   │       │   ├── assets/     # Gestión de activos
│   │       │   ├── incidents/  # Incidencias
│   │       │   ├── reports/    # Generación de reportes PDF/Excel
│   │       │   ├── analytics/  # Estadísticas y analíticas
│   │       │   ├── ai/         # Insights de negocio (análisis de datos)
│   │       │   ├── audit/      # Registro de auditoría
│   │       │   ├── backup/     # Backups de datos
│   │       │   └── ...
│   │       ├── cache/          # CacheService (Redis con fallback graceful)
│   │       ├── common/         # Guards, decoradores, pipes globales
│   │       └── database/       # PrismaService
│   ├── web/                    # Frontend Next.js 15
│   │   └── src/
│   │       ├── app/            # App Router de Next.js
│   │       ├── components/     # Componentes UI reutilizables
│   │       ├── stores/         # Estado global (Zustand)
│   │       └── lib/            # API client, hooks, utilidades
│   └── mobile/                 # (En desarrollo)
├── packages/
│   ├── types/                  # Tipos TypeScript compartidos
│   ├── shared/                 # Constantes y utilidades compartidas
│   └── ui/                     # Componentes UI compartidos
├── infrastructure/
│   └── postgres/init.sql       # Script de inicialización de PostgreSQL
├── nginx/                      # Configuración de Nginx (producción)
├── docker-compose.yml          # Producción
├── docker-compose.dev.yml      # Desarrollo con Docker
└── turbo.json                  # Configuración de Turbo build
```

---

## Módulos del sistema

| Módulo | Descripción |
|--------|-------------|
| **Auth** | Login, logout, refresh tokens, MFA (TOTP), cambio de contraseña |
| **Users** | CRUD usuarios, roles, permisos por sucursal |
| **Roles & Permisos** | Sistema granular de permisos por recurso |
| **Empresas (Tenants)** | Multi-empresa con aislamiento de datos |
| **Sucursales** | Múltiples sucursales por empresa |
| **Categorías** | Jerarquía de categorías de productos |
| **Proveedores** | Gestión de proveedores |
| **Productos** | Catálogo con variantes, códigos de barras, precios |
| **Inventario** | Control de stock, transferencias, ajustes |
| **Caja Registradora** | Apertura/cierre de caja, turnos |
| **Ventas** | POS, facturas, devoluciones |
| **Compras** | Órdenes de compra, recepción, aprobaciones |
| **Divisas** | Multi-moneda con tasas de cambio |
| **Clientes** | CRM, historial de compras, suscripciones |
| **Finanzas** | Ingresos, gastos, flujo de caja |
| **Documentos** | Generación de PDF e informes |
| **Activos** | Inventario de activos fijos, mantenimientos |
| **Incidencias** | Sistema de tickets internos |
| **Notificaciones** | Notificaciones en tiempo real |
| **Auditoría** | Log de todas las acciones del sistema |
| **Reportes** | Exportación PDF/Excel de datos |
| **Analíticas** | Dashboard con estadísticas de negocio |
| **Insights** | Análisis automático de stock, renovaciones y alertas |
| **Backup** | Respaldo y restauración de datos |
| **Calendario** | Eventos y recordatorios |

---

## Seguridad

- **JWT RS256** — par de claves asimétricas (privada firma, pública verifica)
- **Tokens de acceso** — en memoria (no en localStorage, protección XSS), expiración 15 min
- **Refresh tokens** — HttpOnly cookie, expiración 7 días
- **Blacklist de tokens** — invalidación inmediata en Redis al hacer logout
- **MFA** — autenticación de dos factores con TOTP (Google Authenticator)
- **Argon2id** — hash de contraseñas con parámetros seguros
- **Rate limiting** — protección contra fuerza bruta
- **Helmet** — headers de seguridad HTTP
- **CORS** — configurado para orígenes específicos

---

## Despliegue con Docker (producción)

### 1. Configurar variables de entorno de producción

```bash
cp .env.production.example .env.production
# Editar .env.production con valores reales
```

### 2. Iniciar servicios

```bash
# Construir y levantar todos los servicios
docker-compose up -d --build

# Ver logs en tiempo real
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f api

# Detener todos los servicios
docker-compose down

# Detener y eliminar volúmenes (¡borra datos!)
docker-compose down -v
```

### 3. Migraciones en producción

```bash
docker-compose exec api npx prisma migrate deploy
```

### Servicios Docker

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| postgres | 5432 | PostgreSQL 16 |
| redis | 6379 | Redis 7 |
| api | interno | API NestJS |
| worker | interno | Tareas programadas |
| web | interno | Next.js |
| nginx | 80, 443 | Reverse proxy + SSL |

---

## Variables de entorno

Ver `apps/api/.env.development.example` para desarrollo.  
Ver `apps/api/.env.production.example` para producción.

Variables críticas:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Conexión PostgreSQL |
| `REDIS_URL` | Conexión Redis (opcional) |
| `JWT_PRIVATE_KEY` | Clave privada RSA 2048 para firmar tokens |
| `JWT_PUBLIC_KEY` | Clave pública RSA para verificar tokens |
| `REFRESH_TOKEN_SECRET` | Secreto adicional para refresh tokens |

---

## Solución de problemas comunes

### La API no arranca — `JwtStrategy requires a secret or key`
Las claves RSA no están configuradas en `apps/api/.env`. Sigue la sección "Generar claves RSA".

### Error de conexión a base de datos
Verifica que PostgreSQL está corriendo y que `DATABASE_URL` en `.env` es correcto:
```bash
# PostgreSQL en Windows
Get-Service postgresql*
# Iniciar si está detenido
Start-Service postgresql-x64-16
```

### Errores de tipo TypeScript en `pnpm dev`
El cliente de Prisma no está generado. Ejecuta:
```bash
pnpm --filter=@inventario/api prisma:generate
```

### El frontend muestra datos desactualizados tras recargar
Es comportamiento normal — el token de acceso se regenera automáticamente en la primera llamada a la API mediante el interceptor de axios.

### Redis no disponible
No es un error crítico. El sistema funciona sin Redis con degradación graceful:
- Los tokens no se agregan a blacklist (implicación de seguridad menor)
- No hay caché de datos (respuestas directas a la BD)

---

## Licencia

Propietario — todos los derechos reservados.
