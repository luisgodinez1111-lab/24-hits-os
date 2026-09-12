#!/usr/bin/env node
// Tripwire de RLS: falla si algún código de la API lee/escribe una tabla TENANT
// (la que declara `organizationId` en el schema) usando `this.prisma.client` en vez de
// `withTenant`/`withSystem`. Hacerlo evade RLS y devuelve datos vacíos o de otra
// organización EN SILENCIO — el bug más peligroso del multi-tenant. Ver la memoria
// rls-withtenant-reads. Es auto-mantenible: la lista de modelos tenant se deriva del
// schema, no se hardcodea.
//
// Detecta DOS formas del bug:
//   1) Directa:  this.prisma.client.<tablaTenant>.findMany(...)
//   2) Anidada:  this.prisma.client.<tablaInfra>.findMany({ select: { <relTenant>: {...} } })
//      — el join anidado a una tabla tenant también lo filtra la RLS a null (así se
//      coló el bug del almacén del usuario, PR #79). Se derivan del schema los CAMPOS
//      de relación cuyo destino es una tabla tenant (p. ej. defaultWarehouse -> Warehouse).
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

const accessorOf = (pascal) => pascal[0].toLowerCase() + pascal.slice(1);

// Pasada 1: todos los modelos y cuáles son tenant (organizationId, no-infra).
const allModels = new Set();      // nombres PascalCase
const tenantAccessors = new Set(); // productVariant, warehouse, ...
const tenantPascal = new Set();    // ProductVariant, Warehouse, ...
const modelBodies = [];
for (const m of schema.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
  const [, name, body] = m;
  allModels.add(name);
  modelBodies.push([name, body]);
  if (/\borganizationId\b/.test(body) && !INFRA_MODELS.has(accessorOf(name))) {
    tenantAccessors.add(accessorOf(name));
    tenantPascal.add(name);
  }
}
if (tenantAccessors.size === 0) {
  console.error("check-tenant-access: no se encontraron modelos tenant en el schema (¿ruta correcta?)");
  process.exit(2);
}

// Pasada 2: campos de relación cuyo destino es una tabla tenant. Un campo es relación
// si su tipo (sin []/?) es otro modelo. p. ej. `defaultWarehouse Warehouse?` -> destino
// Warehouse (tenant) -> el nombre `defaultWarehouse` es un "campo de relación tenant".
const tenantRelationFields = new Set();
for (const [, body] of modelBodies) {
  for (const line of body.split("\n")) {
    const f = line.match(/^\s*(\w+)\s+(\w+)(\[\])?/);
    if (!f) continue;
    const [, field, type] = f;
    if (allModels.has(type) && tenantPascal.has(type)) tenantRelationFields.add(field);
  }
}

const methods = "(?:find\\w*|count|aggregate|groupBy|create\\w*|update\\w*|delete\\w*|upsert)";
const callRe = new RegExp(`this\\.prisma\\.client\\.(\\w+)\\.${methods}\\s*\\(`, "g");
// Regex de campos de relación tenant como CLAVE de objeto: `\bdefaultWarehouse\s*:`
// (no matchea `defaultWarehouseId:` porque exige `:` inmediato tras el nombre).
const relKeyRe = tenantRelationFields.size
  ? new RegExp(`\\b(${[...tenantRelationFields].join("|")})\\s*:`)
  : null;

// Extrae el argumento balanceado `(...)` desde `open` (índice del `(`), saltando el
// contenido de strings para no contar paréntesis dentro de literales.
function balancedArg(text, open) {
  let depth = 0, quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i], prev = text[i - 1];
    if (quote) { if (c === quote && prev !== "\\") quote = null; continue; }
    if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return text.slice(open, i + 1); }
  }
  return text.slice(open); // sin cierre (raro): devuelve hasta el final
}

const lineOf = (text, idx) => text.slice(0, idx).split("\n").length;

// Exención puntual: `// rls-ok` (con una razón) en el texto de la llamada.
const offenders = new Map(); // file:line -> mensaje (dedupe)
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (!p.endsWith(".ts") || p.endsWith(".spec.ts") || p.endsWith(".test.ts")) continue;
    const text = readFileSync(p, "utf8");
    const rel = p.replace(root + "/", "");
    for (const m of text.matchAll(callRe)) {
      const model = m[1];
      const openIdx = text.indexOf("(", m.index + m[0].length - 1);
      const arg = balancedArg(text, openIdx);
      const callText = m[0] + arg;
      if (callText.includes("rls-ok")) continue;
      const ln = lineOf(text, m.index);
      const key = `${rel}:${ln}`;
      if (tenantAccessors.has(model)) {
        offenders.set(key, `${key}: acceso DIRECTO a tabla tenant "${model}" vía this.prisma.client`);
      } else if (relKeyRe) {
        const hit = arg.match(relKeyRe);
        if (hit) offenders.set(key, `${key}: join ANIDADO a tabla tenant vía relación "${hit[1]}" bajo this.prisma.client.${model}`);
      }
    }
  }
}
walk(join(root, "apps/api/src"));

if (offenders.size > 0) {
  console.error(`\n❌ RLS: ${offenders.size} acceso(s) a tabla TENANT vía this.prisma.client (evaden RLS):\n`);
  for (const o of offenders.values()) console.error("  " + o);
  console.error(`\nUsa this.prisma.withTenant(orgId, (tx) => tx.<modelo>...) o withSystem. Leer una tabla tenant`);
  console.error(`(directa o por join anidado) con el client filtra a null/otra organización EN SILENCIO.`);
  console.error(`Ver memoria rls-withtenant-reads. Exención puntual verificada: // rls-ok <razón>.\n`);
  process.exit(1);
}
console.log(`✓ RLS tripwire OK: sin accesos (directos ni anidados) a tablas tenant vía prisma.client (${tenantAccessors.size} modelos tenant, ${tenantRelationFields.size} relaciones tenant verificadas).`);
