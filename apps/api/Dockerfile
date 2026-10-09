# syntax=docker/dockerfile:1
# Imagen de la API (NestJS). Se construye desde la raíz del monorepo:
#   docker build -f apps/api/Dockerfile -t inventario-api .

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl && corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ── Dependencias ────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @inventario/api...

# ── Build ───────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @inventario/types build \
 && pnpm --filter @inventario/shared build \
 && pnpm --filter @inventario/api exec prisma generate \
 && pnpm --filter @inventario/api build

# ── Runtime ─────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production TZ=America/Bogota
RUN apk add --no-cache dumb-init tzdata && addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
WORKDIR /app
COPY --from=build --chown=app:app /app /app
WORKDIR /app/apps/api
RUN mkdir -p uploads backups && chown -R app:app uploads backups && chmod +x docker-entrypoint.sh
USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD wget -qO- http://127.0.0.1:3001/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]
