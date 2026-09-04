"use client";

// Gráfica de barras ligera (CSS puro, responsiva, sin dependencias). Ideal para
// series de ventas por día/mes. Con muchos puntos hace scroll horizontal.
export interface Bar {
  label: string; // eje X corto (ej. "14")
  value: number;
  title?: string; // tooltip completo (ej. "2026-08-14 · $1,234")
}

export function BarChart({ bars, height = 160, format }: { bars: Bar[]; height?: number; format?: (v: number) => string }) {
  const fmt = format ?? ((v: number) => String(v));

  if (bars.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400">Sin datos en el rango.</p>;
  }

  const max = Math.max(1, ...bars.map((b) => b.value));
  // Serie con periodos pero SIN actividad (todo en 0): en vez de un área vacía y
  // "muerta", un estado claro con línea base. Las etiquetas de fecha se conservan
  // abajo para dar contexto del rango.
  const allZero = bars.every((b) => b.value === 0);

  return (
    <div className="overflow-x-auto">
      {allZero ? (
        <div className="flex flex-col" style={{ height }}>
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-400">Sin ventas en el periodo</p>
          </div>
          <div className="border-t border-gray-200" />
        </div>
      ) : (
        <div className="flex items-end gap-1" style={{ height, minWidth: bars.length * 14 }}>
          {bars.map((b, i) => (
            <div key={i} className="group flex min-w-[8px] flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t bg-brand/80 transition-colors group-hover:bg-brand"
                style={{ height: `${(b.value / max) * 100}%` }}
                title={b.title ?? `${b.label}: ${fmt(b.value)}`}
              />
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 flex gap-1" style={{ minWidth: bars.length * 14 }}>
        {bars.map((b, i) => (
          <span key={i} className="min-w-[8px] flex-1 text-center text-[9px] text-gray-400">
            {/* Etiqueta dispersa para no saturar cuando hay muchas barras */}
            {bars.length <= 16 || i % Math.ceil(bars.length / 12) === 0 ? b.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
