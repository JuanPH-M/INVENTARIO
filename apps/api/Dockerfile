# ─────────────────────────────────────────────────────────────
# Stage 1: dependencies
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/shared/package.json ./packages/shared/
COPY pnpm-workspace.yaml ./

RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Stage 2: build
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

RUN corepack enable pnpm

# Generate Prisma client
RUN pnpm --filter api prisma generate

# Build the application
RUN pnpm --filter api build

# ─────────────────────────────────────────────────────────────
# Stage 3: production runner
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

# Copy built artifacts
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma ./prisma

# Create upload directories
RUN mkdir -p uploads backups && chown -R nestjs:nodejs uploads backups

USER nestjs

EXPOSE 3001

CMD ["dumb-init", "node", "dist/main"]
