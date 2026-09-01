"use client";

import { useEffect } from "react";

// Registra el service worker (solo en producción, para no cachear en desarrollo).
// Habilita el modo offline del reparto: la app abre sin señal y muestra la última
// ruta/pedidos cargados. Ver public/sw.js.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
