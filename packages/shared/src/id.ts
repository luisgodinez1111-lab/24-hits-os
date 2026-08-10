import { uuidv7 } from "uuidv7";

// Genera un identificador UUID v7 (ordenable por tiempo, no adivinable).
// Centralizado aquí para poder migrar a `uuidv7()` nativo de PostgreSQL (pg18)
// sin tocar los call sites. Ver ADR-007.
export function newId(): string {
  return uuidv7();
}

// Valida que una cadena tenga forma de UUID (cualquier versión).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
