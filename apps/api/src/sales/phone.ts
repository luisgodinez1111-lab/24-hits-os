// Normaliza un teléfono mexicano a su llave canónica: los últimos 10 dígitos (el
// número local real), sin importar cómo se haya escrito. Así todas estas variantes
// mapean a la misma llave "6141234567" → mismo cliente, misma búsqueda:
//   "614 123 4567", "614-123-4567", "+52 614 123 4567", "52 614 123 4567",
//   "+52 1 614 123 4567", "521 614 123 4567".
// El "52" (país) y el "1" (prefijo móvil histórico) quedan fuera al tomar los
// últimos 10 dígitos. Para búsquedas parciales ("614") devuelve lo que haya.
export function phoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
