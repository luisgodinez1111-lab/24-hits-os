import type { ReactNode } from "react";
import { cn } from "./cn";

// ---------------------------------------------------------------- Badge
type BadgeTone = "gray" | "green" | "red" | "amber" | "blue" | "brand";
const badgeTones: Record<BadgeTone, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  brand: "bg-brand/10 text-brand",
};

export function Badge({
  children,
  tone = "gray",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Alert
type AlertTone = "info" | "success" | "warning" | "error";
const alertTones: Record<AlertTone, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

export function Alert({
  children,
  tone = "info",
  title,
  className,
}: {
  children?: ReactNode;
  tone?: AlertTone;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border p-4 text-sm", alertTones[tone], className)}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Skeleton
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-gray-200", className)} />;
}

// ---------------------------------------------------------------- TableSkeleton
// Carga con FORMA de tabla (encabezado + filas), en vez de un bloque gris. Da la
// sensación de que el contenido "ya casi llega" — sello de un SaaS pulido. Imita el
// contenedor del primitivo Table (borde + sombra + encabezado gris).
export function TableSkeleton({
  rows = 6,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Cargando…"
      className={cn("overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card", className)}
    >
      <div className="flex gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3 flex-1", i === 0 && "max-w-[30%]")} />
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-[30%]")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Spinner
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
      role="status"
      aria-label="Cargando"
    />
  );
}

// ---------------------------------------------------------------- ErrorState
// Estado uniforme cuando una carga FALLA (no cuando está vacía). Ofrece reintentar,
// para que un error de red no deje la pantalla en blanco sin salida.
export function ErrorState({
  title = "Algo salió mal",
  description = "No se pudieron cargar los datos. Revisa tu conexión e inténtalo de nuevo.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50 p-10 text-center" role="alert">
      <p className="text-2xl" aria-hidden>⚠️</p>
      <p className="mt-2 font-medium text-red-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-red-700">{description}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 outline-none transition-colors hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- EmptyState
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
      {icon ? <div className="mb-3 text-4xl">{icon}</div> : null}
      <p className="font-medium text-gray-700">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
