"use client";

import { useEffect, useState } from "react";

// Aviso discreto cuando el dispositivo pierde conexión. Para el repartidor en campo:
// sabe que está offline, que sigue viendo su ruta cacheada, y que espere señal para
// cobrar/entregar (la cola de acciones offline llega en el siguiente incremento).
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[999] bg-amber-500 px-3 py-1.5 text-center text-xs font-semibold text-white shadow"
    >
      Sin conexión — modo offline. Sigues viendo tu ruta; espera señal para cobrar/entregar.
    </div>
  );
}
