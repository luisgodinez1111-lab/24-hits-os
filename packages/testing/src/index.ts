// Utilidades compartidas para tests (unit/integration/e2e).

// Genera un email único por test para evitar colisiones de unicidad.
export function uniqueEmail(prefix = "test"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}.${Date.now()}.${rand}@example.local`;
}

// Genera un slug único de organización.
export function uniqueSlug(prefix = "org"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}
