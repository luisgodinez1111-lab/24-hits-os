"use client";

import { useCallback, type ReactNode } from "react";
import { cn } from "./cn";

// ---------------------------------------------------------------- Switch
// Interruptor on/off accesible (role=switch). Teclado: Enter/Espacio alternan
// (es un <button>). El pulgar anima al cambiar, respetando reduce-motion.
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string; // nombre accesible
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand" : "bg-gray-300"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-fast ease-standard motion-reduce:transition-none",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------- Segmented
// Control segmentado (estilo iOS). role=radiogroup + radios; flechas mueven la
// selección. El activo va sobre una "pastilla" blanca elevada.
export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  full = false,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  full?: boolean; // ocupa todo el ancho con segmentos de igual tamaño
  ariaLabel: string;
  className?: string;
}) {
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const i = options.findIndex((o) => o.value === value);
      if (i < 0) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        onChange(options[(i + 1) % options.length]!.value);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        onChange(options[(i - 1 + options.length) % options.length]!.value);
      }
    },
    [options, value, onChange]
  );

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("rounded-lg bg-gray-100 p-0.5", full ? "flex w-full" : "inline-flex shrink-0", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md font-medium outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-brand",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              full && "flex-1 text-center",
              active ? "bg-raised text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
