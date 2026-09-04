"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

// Selector de elementos enfocables (para la trampa de foco de los modales).
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Comportamiento común de un modal: Escape cierra, Tab queda atrapado dentro,
// el fondo no hace scroll y el foco entra al panel al abrir.
function useModalBehavior(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    if (!open) return;
    // Recuerda el elemento enfocado para devolverle el foco al cerrar (accesibilidad).
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // el fondo no hace scroll detrás del modal
    panelRef.current?.focus(); // el foco entra al modal al abrir
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // Devuelve el foco al disparador al cerrar (no se pierde en el <body>).
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, panelRef]);
}

// ---------------------------------------------------------------- Dialog
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalBehavior(open, onClose, panelRef);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 motion-safe:animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Diálogo"}
        className="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col rounded-sheet bg-raised shadow-overlay outline-none motion-safe:animate-scale-in"
      >
        {title ? (
          <div className="shrink-0 border-b border-gray-100 p-5">
            <h3 id={titleId} className="font-semibold text-gray-900">{title}</h3>
          </div>
        ) : null}
        {/* min-h-0 permite que el cuerpo scrollee dentro del tope de altura; header/footer fijos. */}
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 p-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Drawer
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalBehavior(open, onClose, panelRef);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 motion-safe:animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Panel"}
        className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col overflow-y-auto bg-raised pb-safe shadow-overlay outline-none motion-safe:animate-slide-in-right"
      >
        {title ? (
          <div className="border-b border-gray-100 p-5">
            <h3 id={titleId} className="font-semibold text-gray-900">{title}</h3>
          </div>
        ) : null}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Dropdown
// Menú accesible: se abre con clic, se cierra con clic-fuera/Escape, y se navega
// por teclado (flechas, Home/End). Al abrir, el foco entra al primer ítem.
export function Dropdown({
  trigger,
  children,
  align = "right",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    // Enfoca el primer ítem del menú al abrir (navegación por teclado).
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Flechas / Home / End mueven el foco entre los ítems del menú.
  const onMenuKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        {trigger}
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute z-20 mt-2 min-w-44 origin-top overflow-hidden rounded-xl border border-gray-200 bg-raised p-1 shadow-pop outline-none motion-safe:animate-scale-in",
            align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  tone = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        "block w-full rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors duration-fast hover:bg-gray-100 focus-visible:bg-gray-100",
        tone === "danger" ? "text-red-600" : "text-gray-700"
      )}
    >
      {children}
    </button>
  );
}
