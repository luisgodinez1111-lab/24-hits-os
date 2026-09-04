"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@24hits/ui";
import { hasPermission, useMe } from "@/lib/me";
import { navSections, type NavItem } from "@/lib/nav";

// Evento global para abrir el palette desde otros componentes (p. ej. el botón del Header).
export const OPEN_COMMAND_PALETTE = "command-palette:open";

type Cmd = NavItem & { section: string };

// Command palette (⌘K / Ctrl+K): buscar y navegar a cualquier pantalla con el teclado.
// Respeta permisos (no muestra lo que el usuario no puede ver).
export function CommandPalette() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [];
    for (const s of navSections) {
      for (const it of s.items) {
        if (!it.perm || isLoading || hasPermission(me, it.perm)) out.push({ ...it, section: s.title });
      }
    }
    return out;
  }, [me, isLoading]);

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () => (q ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.section.toLowerCase().includes(q)) : commands),
    [commands, q]
  );

  // ⌘K / Ctrl+K alterna; Esc cierra; evento externo abre.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE, onOpen);
    };
  }, []);

  // Al abrir: limpia, enfoca el buscador, bloquea el scroll del fondo.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => setActive(0), [q]);

  const go = useCallback(
    (c: Cmd | undefined) => {
      if (!c) return;
      setOpen(false);
      router.push(c.href);
    },
    [router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[14vh]" role="dialog" aria-modal="true" aria-label="Buscar y navegar">
      <div className="absolute inset-0 bg-black/40 motion-safe:animate-fade-in" onClick={() => setOpen(false)} aria-hidden />
      <div
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-sheet border border-gray-200 bg-raised shadow-overlay motion-safe:animate-scale-in"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-gray-100 px-4">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ir a… (POS, Pedidos, Ruta, Catálogo…)"
            aria-label="Buscar pantalla"
            className="h-12 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
          />
          <kbd className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-gray-400">Sin resultados.</p>
          ) : (
            <ul>
              {results.map((c, i) => {
                const Icon = c.icon;
                const isActive = i === active;
                return (
                  <li key={c.href}>
                    <button
                      type="button"
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(c)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none transition-colors",
                        isActive ? "bg-brand/10 text-brand" : "text-gray-700"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-brand" : "text-gray-400")} />
                      <span className="flex-1 font-medium">{c.label}</span>
                      <span className="text-xs text-gray-400">{c.section}</span>
                      {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-brand" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
