#!/usr/bin/env node
// Tripwire de RLS: falla si algún código de la API lee/escribe una tabla TENANT
// (la que declara `organizationId` en el schema) usando `this.prisma.client` en vez de
// `withTenant`/`withSystem`. Hacerlo evade RLS y devuelve datos vacíos o de otra
// organización EN SILENCIO — el bug más peligroso del multi-tenant. Ver la memoria
// rls-withtenant-reads. Es auto-mantenible: la lista de modelos tenant se deriva del
// schema, no se hardcodea.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(root, "packages/database/prisma/schema.prisma"), "utf8");

// Modelos de INFRA que gestionan la tenancy y se acceden por el cliente base POR
// DISEÑO (auth/iam/audit operan alrededor del contexto RLS). Se excluyen del chequeo
// aunque tengan organizationId. Todo lo demás (negocio) SÍ debe ir por withTenant.
const INFRA_MODELS = new Set([
  "session", "organizationMembership", "role", "auditEvent", "organization",
]);

// Modelos tenant = los que declaran organizationId, menos los de infra. Se pasan a la
// forma del accesor de Prisma (primera letra minúscula): `ProductVariant` -> `productVariant`.
const tenantModels = [];
for (const m of schema.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
  if (/\borganizationId\b/.test(m[2])) {
    const accessor = m[1][0].toLowerCase() + m[1].slice(1);
    if (!INFRA_MODELS.has(accessor)) tenantModels.push(accessor);
  }
}
if (tenantModels.length === 0) {
  console.error("check-tenant-access: no se encontraron modelos tenant en el schema (¿ruta correcta?)");
  process.exit(2);
}

const methods = "(find\\w*|count|aggregate|groupBy|create\\w*|update\\w*|delete\\w*|upsert)";
const re = new RegExp(`this\\.prisma\\.client\\.(${tenantModels.join("|")})\\.${methods}`);

// Exención puntual: agrega `// rls-ok` al final de la línea (con una razón) si es un
// acceso por client legítimo y verificado. Se escanea TODO apps/api/src (no se excluye
// por carpeta: leer una tabla de negocio por el client es un bug esté donde esté).

const offenders = [];
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (!p.endsWith(".ts") || p.endsWith(".spec.ts") || p.endsWith(".test.ts")) continue;
    readFileSync(p, "utf8").split("\n").forEach((line, i) => {
      if (re.test(line) && !line.includes("rls-ok")) offenders.push(`${p.replace(root + "/", "")}:${i + 1}: ${line.trim()}`);
    });
  }
}
walk(join(root, "apps/api/src"));

if (offenders.length > 0) {
  console.error(`\n❌ RLS: ${offenders.length} acceso(s) a tabla TENANT vía this.prisma.client (evaden RLS):\n`);
  for (const o of offenders) console.error("  " + o);
  console.error(`\nUsa this.prisma.withTenant(orgId, (tx) => tx.<modelo>...) o withSystem. Leer una tabla tenant`);
  console.error(`por el client filtra a null/otra organización EN SILENCIO. Ver memoria rls-withtenant-reads.\n`);
  process.exit(1);
}
console.log(`✓ RLS tripwire OK: sin accesos directos a tablas tenant vía prisma.client (${tenantModels.length} modelos tenant verificados).`);
