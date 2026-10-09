#!/bin/sh
# Arranque del contenedor: aplica migraciones pendientes, datos base y luego inicia la API.
set -e

echo "▶ Aplicando migraciones de base de datos..."
npx prisma migrate deploy

echo "▶ Cargando datos base (planes, divisas, permisos, roles y empresa inicial)..."
npx ts-node --transpile-only prisma/seeds/seed.ts

echo "▶ Iniciando API"
exec node dist/main.js
