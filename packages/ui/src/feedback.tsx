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
