"use client";

import { type ReactNode } from "react";
import { cn } from "./cn";

// Tooltip accesible y sin dependencias: aparece en hover Y en foco de teclado
// (group-focus-within). Fondo negro translúcido → legible en claro y oscuro. No
// bloquea el puntero. Para íconos usa además un aria-label en el control hijo.
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 scale-95 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-pop backdrop-blur-sm transition duration-fast ease-standard",
          "group-hover/tt:scale-100 group-hover/tt:opacity-100 group-focus-within/tt:scale-100 group-focus-within/tt:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
        )}
      >
        {label}
      </span>
    </span>
  );
}
