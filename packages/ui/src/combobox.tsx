"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "./cn";

export interface ComboOption {
  value: string;
  label: string;
}

// Combobox: menú desplegable que también acepta texto. Se elige una opción de la
// lista o se escribe para filtrar. Con `allowCreate`, si el texto no coincide con
// ninguna opción, ofrece "Crear «texto»" y lo da de alta al vuelo vía `onCreate`.
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Selecciona o escribe…",
  disabled = false,
  allowCreate = false,
  onCreate,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  onCreate?: (text: string) => Promise<string>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number): string => `${baseId}-opt-${i}`;

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const trimmed = query.trim();
  const exact = options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const showCreate = allowCreate && Boolean(onCreate) && trimmed.length > 0 && !exact;
  const total = filtered.length + (showCreate ? 1 : 0);

  // Cierra al hacer clic fuera del componente.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => setActive(0), [query, open]);

  // Mantiene la opción activa a la vista al navegar con flechas en listas largas.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, baseId]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  async function create() {
    if (!onCreate || !trimmed || creating) return;
    try {
      setCreating(true);
      const newValue = await onCreate(trimmed);
      choose(newValue);
    } finally {
      setCreating(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, total - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (showCreate && active === filtered.length) void create();
      else if (filtered[active]) choose(filtered[active].value);
      else if (filtered[0]) choose(filtered[0].value);
    }
  }

  const inputClasses =
    "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 pr-9 text-sm outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-gray-50";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && total > 0 ? optionId(active) : undefined}
        className={inputClasses}
        placeholder={placeholder}
        disabled={disabled}
        value={open ? query : selected?.label ?? ""}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={onKeyDown}
      />
      {/* Chevron */}
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {open && (
        <ul role="listbox" id={listId} className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-raised py-1 text-sm shadow-pop">
          {filtered.map((o, i) => (
            <li key={o.value === "" ? "__empty" : o.value} role="presentation">
              <button
                type="button"
                role="option"
                id={optionId(i)}
                aria-selected={o.value === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o.value)}
                className={cn(
                  "flex w-full px-3 py-2 text-left hover:bg-gray-50",
                  i === active && "bg-gray-50",
                  o.value === value && "font-medium text-brand"
                )}
              >
                {o.label}
              </button>
            </li>
          ))}

          {filtered.length === 0 && !showCreate && (
            <li className="px-3 py-2 text-gray-400">Sin resultados</li>
          )}

          {showCreate && (
            <li role="presentation">
              <button
                type="button"
                role="option"
                id={optionId(filtered.length)}
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void create()}
                className={cn(
                  "flex w-full items-center px-3 py-2 text-left text-brand hover:bg-gray-50",
                  active === filtered.length && "bg-gray-50"
                )}
              >
                {creating ? "Creando…" : `+ Crear «${trimmed}»`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
