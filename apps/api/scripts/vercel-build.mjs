#!/usr/bin/env node
// Build del API en Vercel con migraciones de Prisma aplicadas de forma segura.
//
// Por qué existe: las migraciones de prod eran MANUALES. Si se mergea una migración
// a `main` y nadie corre `db:deploy`, el API queda esperando columnas que la BD de
// prod no tiene → 500 en silencio (la caída que ya vivimos). Aquí las migraciones se
// aplican como parte del build de producción, con salvaguardas para NO correr contra
// la base equivocada.
//
// Reglas:
//   1. Solo en producción (VERCEL_ENV === "production"). En preview/dev NO se toca la
//      BD de prod — un deploy de preview jamás migra producción.
//   2. En producción exige DATABASE_URL. Sin ella ABORTA el build en vez de desplegar
//      código contra una base inexistente: fallar fuerte > romper en silencio. Si falta
//      DIRECT_URL (la conexión directa que Prisma usa para migrar), se usa DATABASE_URL
//      como respaldo — así el deploy no se rompe si solo tienes una URL configurada.
//   3. `prisma migrate deploy` es idempotente: aplica solo lo pendiente, nunca resetea
//      ni borra datos. Correrlo sin migraciones pendientes es un no-op seguro.
//
// El comando de build real sigue siendo el de siempre (turbo, que compila también las
// dependencias del API), así que este script solo AÑADE el paso de migración.

import { spawnSync } from "node:child_process";

/** Ejecuta un comando heredando la salida; aborta el build si falla. */
function run(command) {
  console.log(`\n▶ ${command}`);
  const result = spawnSync(command, { stdio: "inherit", shell: true, env: process.env });
  if (result.status !== 0) {
    console.error(`\n✗ Falló: ${command} (exit ${result.status ?? "signal " + result.signal})`);
    process.exit(result.status ?? 1);
  }
}

const vercelEnv = process.env.VERCEL_ENV ?? "local";

if (vercelEnv === "production") {
  // Salvaguarda dura: sin DATABASE_URL no hay a dónde migrar ni con qué correr el API.
  if (!process.env.DATABASE_URL) {
    console.error(
      "\n✗ VERCEL_ENV=production pero falta DATABASE_URL.\n" +
        "  Se aborta el build para NO desplegar el API contra una base inexistente.\n" +
        "  Configúrala en el proyecto de Vercel del API (Settings → Environment Variables, scope Production):\n" +
        "    • DATABASE_URL = URL de Neon que usa el API en runtime\n" +
        "    • DIRECT_URL   = (recomendada) URL directa/unpooled de Neon para migrar",
    );
    process.exit(1);
  }
  // Prisma usa DIRECT_URL para migrar (schema: directUrl = env("DIRECT_URL")). Si no está
  // configurada, usamos DATABASE_URL como respaldo para no romper el deploy.
  if (!process.env.DIRECT_URL) {
    console.warn("⚠ DIRECT_URL no está definida — se usará DATABASE_URL para migrar (considera configurar la URL directa de Neon).");
    process.env.DIRECT_URL = process.env.DATABASE_URL;
  }
  console.log("▶ Producción detectada: aplicando migraciones pendientes (prisma migrate deploy)…");
  run("pnpm --filter @24hits/database db:deploy");
} else {
  console.log(`⏭  VERCEL_ENV=${vercelEnv}: no es producción — se omiten migraciones (la BD de prod no se toca).`);
}

// Build normal del API (turbo compila el API y sus dependencias del monorepo).
run("pnpm turbo run build --filter=@24hits/api");
