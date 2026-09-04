"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Transición de entrada por ruta: cada navegación reproduce un fade + subida
// sutil (8px, ease-emphasized), dando continuidad espacial estilo app nativa.
// Va "keyed" por pathname para re-montar el subárbol y re-disparar la animación
// CSS en cada cambio de ruta. Respeta prefers-reduced-motion vía motion-safe.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="motion-safe:animate-slide-up">
      {children}
    </div>
  );
}
