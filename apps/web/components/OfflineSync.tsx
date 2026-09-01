"use client";

import { useEffect, useState } from "react";
import { listPending, syncPending } from "@/lib/offline-queue";

// Sincroniza la cola de entregas offline al recuperar conexión (y al abrir la app),
// y muestra cuántas quedan por sincronizar. Reintento suave cada 30s por si el evento
// "online" no dispara en algún navegador.
export function OfflineSync() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = () => setPending(listPending().filter((p) => !p.lastError).length);
    const trySync = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      void syncPending().finally(refresh);
    };
    refresh();
    trySync(); // arranque: sincroniza pendientes de sesiones previas

    window.addEventListener("online", trySync);
    window.addEventListener("hits:offline-queue-changed", refresh);
    const timer = setInterval(() => {
      if (listPending().some((p) => !p.lastError)) trySync();
    }, 30_000);

    return () => {
      window.removeEventListener("online", trySync);
      window.removeEventListener("hits:offline-queue-changed", refresh);
      clearInterval(timer);
    };
  }, []);

  if (pending === 0) return null;
  return (
    <div
      role="status"
      className="fixed bottom-3 right-3 z-[999] rounded-full bg-gray-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur"
    >
      ⏳ {pending} {pending === 1 ? "entrega" : "entregas"} por sincronizar
    </div>
  );
}
