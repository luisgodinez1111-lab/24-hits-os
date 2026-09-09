// Normalización de teléfono (espejo de apps/api/src/sales/phone.ts): la llave canónica
// son los últimos 10 dígitos del WhatsApp, sin importar el formato (+52 / 52 / 521 /
// espacios / guiones). Se usa para buscar clientes por número tolerando cualquier
// variante de escritura.
export function phoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// ¿El cliente coincide con lo que se escribió? Por nombre (texto) o por WhatsApp
// (dígitos, normalizado). Sirve para el buscador del pedido y de la lista de clientes.
export function customerMatches(
  c: { name: string; phone?: string | null },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (c.name.toLowerCase().includes(q)) return true;
  const qDigits = phoneKey(query);
  return qDigits.length > 0 && phoneKey(c.phone).includes(qDigits);
}
