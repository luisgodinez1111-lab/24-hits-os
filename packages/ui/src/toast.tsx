"use client";

import { createContext, useCallback, useContext, useState, type ReactNode, type SVGProps } from "react";
import { cn } from "./cn";

// Íconos inline (el design system no depende de una librería de íconos).
const svg = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});
function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svg(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function XCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svg(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}
function InfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svg(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svg(props)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

type ToastTone = "info" | "success" | "error";
interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  leaving: boolean;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE = {
  info: { Icon: InfoIcon, ring: "border-gray-200", accent: "text-brand" },
  success: { Icon: CheckCircleIcon, ring: "border-green-200", accent: "text-green-700" },
  error: { Icon: XCircleIcon, ring: "border-red-200", accent: "text-red-700" },
} as const;

// Los errores se quedan más tiempo (el usuario suele necesitar leerlos/actuar).
const DURATION: Record<ToastTone, number> = { info: 4000, success: 4000, error: 6000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  // Sale con animación: marca "leaving", y elimina cuando termina la salida.
  const dismiss = useCallback(
    (id: string) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => remove(id), 200);
    },
    [remove]
  );

  const push = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = Math.random().toString(36).slice(2);
      const ttl = DURATION[tone];
      setToasts((prev) => [...prev, { id, message, tone, leaving: false }]);
      // Anima la salida un poco antes de removerlo.
      setTimeout(() => setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))), ttl - 220);
      setTimeout(() => remove(id), ttl);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end gap-2 p-4 pb-safe">
        {toasts.slice(-5).map((t) => {
          const meta = TONE[t.tone];
          const Icon = meta.Icon;
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              aria-live={t.tone === "error" ? "assertive" : "polite"}
              className={cn(
                "pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border bg-raised p-3 pr-2 shadow-overlay",
                meta.ring,
                t.leaving ? "motion-safe:animate-toast-out" : "motion-safe:animate-toast-in"
              )}
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", meta.accent)} />
              <p className="flex-1 pt-0.5 text-sm leading-snug text-gray-800">{t.message}</p>
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={() => dismiss(t.id)}
                className="-mr-0.5 shrink-0 rounded-md p-1 text-gray-400 outline-none transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-brand"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
