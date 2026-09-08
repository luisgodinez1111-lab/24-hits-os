// Exportación a CSV abrible en Excel. Mismo formato que usa el Tablero de reportes:
// cada campo con comillas si trae comas/comillas/saltos, BOM para respetar acentos y
// fin de línea CRLF. Es 100% cliente (sobre los datos ya cargados y filtrados).

export function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Descarga una tabla simple (encabezados + filas) como archivo .csv.
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): void {
  const lines = [headers, ...rows].map((r) => r.map(csvEscape).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Fecha corta (YYYY-MM-DD) para nombrar los archivos exportados.
export function csvDateTag(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
