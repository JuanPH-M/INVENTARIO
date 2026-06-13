## TD-001 — Reactivar verificación de tipos en tests de API
Prioridad: Media
Detectado: durante corrección de create-sale.use-case.spec.ts (Fix 2, ciclo QA 2026-06-02)
Estado: Abierto

Contexto:
apps/api/package.json tiene ts-jest.diagnostics: false para permitir
que la suite de tests compile a pesar de errores de noImplicitAny en
apps/api/src/database/prisma.service.ts.

Problema:
Con diagnostics desactivado, errores de tipos reales en los tests no
son detectados durante CI, reduciendo la efectividad del tipado estático.

Archivos afectados:
  - apps/api/package.json (globals.ts-jest.diagnostics)
  - apps/api/src/database/prisma.service.ts (errores de origen)

Pasos para cerrar:
  1. Abrir prisma.service.ts e identificar todas las ocurrencias de noImplicitAny.
  2. Agregar tipos explícitos a cada parámetro o variable afectada.
     Tipos esperados basados en el contexto de PrismaClient:
       - tablenames: Array<{ tablename: string }> (ya existe en el tipo del $queryRaw)
       - Cualquier parámetro de callback sin tipo → usar el tipo de retorno de Prisma
  3. Ejecutar pnpm test --filter=@inventario/api con diagnostics: true.
  4. Confirmar que todos los tests siguen pasando.
  5. Eliminar la clave diagnostics: false (y _diagnostics_note) de package.json.
  6. Cerrar este item actualizando Estado: Cerrado y agregando la fecha.

Criterio de aceptación:
  pnpm test --filter=@inventario/api pasa con ts-jest.diagnostics: true
  sin errores de tipos ni de lógica.

---

## TD-002 — Extraer GET /auth/me a GetProfileUseCase
Prioridad: Baja
Detectado: durante auditoría de arquitectura (V-7.5, ciclo QA 2026-06-02)
Estado: Abierto

Contexto:
AuthController sigue inyectando PrismaService directamente para
el endpoint GET /auth/me porque no existe un use case dedicado.
El resto de la lógica de autenticación fue correctamente migrada
a use cases en el ciclo anterior.

Problema:
La arquitectura Clean/DDD declarada en el proyecto no se cumple
completamente en AuthController mientras GET /auth/me acceda
a Prisma directamente. Esto dificulta el testing unitario del
método me() sin la base de datos real.

Archivos afectados:
  - apps/api/src/modules/auth/presentation/auth.controller.ts (método me())
  - apps/api/src/modules/auth/auth.module.ts (falta GetProfileUseCase en providers)

Pasos para cerrar:
  1. Crear apps/api/src/modules/auth/application/use-cases/get-profile.use-case.ts
     con el método execute(userId: string) que contiene la lógica actual de me().
  2. Registrar GetProfileUseCase en auth.module.ts providers y exports.
  3. En AuthController.me(), reemplazar la lógica directa por:
     return this.getProfileUseCase.execute(user.sub)
  4. Si PrismaService queda sin otros usos en el controlador, eliminarlo
     del constructor.
  5. Agregar get-profile.use-case.spec.ts con tests unitarios.
  6. Cerrar este item actualizando Estado: Cerrado y agregando la fecha.

Criterio de aceptación:
  AuthController no inyecta PrismaService directamente.
  get-profile.use-case.spec.ts pasa sin acceso a BD real.
