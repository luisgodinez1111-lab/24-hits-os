// Formateadores centralizados — una sola fuente para toda la app.

const DASH = "—";

// Moneda MXN. Acepta string (Decimal serializado), number o null/undefined.
export function money(v?: string | number | null): string {
  if (v == null) return DASH;
  return `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Porcentaje desde una fracción (0.15 → "15.0%").
export function pct(v?: string | number | null): string {
  if (v == null) return DASH;
  return `${(Number(v) * 100).toFixed(1)}%`;
}

// Fecha corta local (es-MX).
export function formatDate(v?: string | number | Date | null): string {
  if (v == null) return DASH;
  return new Date(v).toLocaleDateString("es-MX");
}

// Fecha y hora local (es-MX).
export function formatDateTime(v?: string | number | Date | null): string {
  if (v == null) return DASH;
  return new Date(v).toLocaleString("es-MX");
}
