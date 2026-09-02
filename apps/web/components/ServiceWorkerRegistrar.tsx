"use client";

import { useEffect } from "react";

// Identificador del build (commit en Vercel; timestamp en su defecto). Se inyecta en
// tiempo de build vía next.config → cambia en cada deploy real.
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

// Registra el service worker (solo en producción) y hace que los DEPLOYS SE REFLEJEN
// SOLOS: el SW se registra como `/sw.js?v=<build>`, así cada deploy es un SW distinto
// que el navegador instala; cuando ese SW nuevo toma el control, recargamos una vez
// para mostrar la versión nueva sin que el usuario borre caché. Ver public/sw.js.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let refreshing = false;
    // Un SW nuevo tomó el control (tras un deploy) → recarga UNA vez. Guarda anti-loop.
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const register = async () => {
      try {
        // Solo auto-recargamos si YA había un SW controlando la página: así una
        // actualización se refleja sola, pero la PRIMERA instalación no dispara reload.
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        }
        // ?v=<build> cambia por deploy ⇒ el navegador detecta un SW distinto y lo instala.
        // updateViaCache:'none' evita que el propio sw.js se sirva de la caché HTTP.
        const reg = await navigator.serviceWorker.register(`/sw.js?v=${BUILD_ID}`, { updateViaCache: "none" });
        await reg.update().catch(() => undefined);
      } catch {
        /* registro del SW no crítico: si falla, la app funciona igual (online) */
      }
    };

    const onLoad = () => void register();
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", onLoad);

    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
