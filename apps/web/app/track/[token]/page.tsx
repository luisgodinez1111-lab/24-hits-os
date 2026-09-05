"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TrackMap } from "@/components/TrackMap";

type Track = {
  number: string;
  status: string;
  deliveryStatus: string | null;
  customerName: string | null;
  destination: { lat: number; lng: number } | null;
  driver: { lat: number; lng: number; name: string | null; minutesAgo: number } | null;
  etaMin: number | null;
};

// Página PÚBLICA de rastreo para el cliente ("tu pedido va en camino"). Sin login.
// Refresca cada 12 s: muestra al repartidor acercándose en vivo + ETA.
export default function TrackPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<Track | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/v1/track/${token}`, { cache: "no-store" });
        if (!res.ok) {
          if (alive) setState((s) => (s === "ok" ? s : "notfound"));
          return;
        }
        const j = (await res.json()) as Track;
        if (alive) {
          setData(j);
          setState("ok");
        }
      } catch {
        /* red intermitente del cliente → conservamos el último estado */
      }
    };
    void load();
    const id = setInterval(load, 12000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token]);

  if (state === "notfound") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
        <div className="text-4xl">🔍</div>
        <p className="text-lg font-semibold text-gray-900">Rastreo no disponible</p>
        <p className="max-w-xs text-sm text-gray-500">Este enlace no es válido o el pedido ya se cerró.</p>
      </div>
    );
  }

  const delivered = data?.deliveryStatus === "DELIVERED" || data?.status === "COMPLETED";
  const dispatched = data?.deliveryStatus === "DISPATCHED";

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-gray-100">
      <div className="absolute inset-0">
        <TrackMap destination={data?.destination ?? null} driver={data?.driver ?? null} />
      </div>

      {/* Header flotante */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3 pt-safe">
        <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-sm font-bold text-gray-900 shadow backdrop-blur">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-brand text-[10px] font-bold text-white">24</span> HITS
        </span>
        {data?.number ? (
          <span className="pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 font-mono text-xs text-gray-600 shadow backdrop-blur">{data.number}</span>
        ) : null}
      </div>

      {/* Tarjeta de estado (bottom sheet) */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-3 pb-safe">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-overlay">
          {delivered ? (
            <>
              <p className="text-2xl font-extrabold text-green-600">¡Entregado! 🎉</p>
              <p className="mt-1 text-sm text-gray-500">
                Gracias{data?.customerName ? `, ${data.customerName}` : ""}. Tu pedido {data?.number} fue entregado.
              </p>
            </>
          ) : data?.driver ? (
            <>
              <p className="text-sm font-medium text-gray-500">{dispatched ? "Tu pedido va en camino" : "Tu repartidor está por salir"}</p>
              <div className="mt-1 flex items-baseline gap-2">
                {data.etaMin != null ? (
                  <p className="font-mono text-3xl font-extrabold tabular-nums text-gray-900">
                    ~{data.etaMin} <span className="text-lg font-bold text-gray-500">min</span>
                  </p>
                ) : (
                  <p className="text-2xl font-bold text-gray-900">En camino</p>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {data.driver.name ? (
                  <>
                    <b className="text-gray-700">{data.driver.name}</b> es tu repartidor
                  </>
                ) : (
                  "Repartidor en ruta"
                )}
                {data.driver.minutesAgo > 1 ? ` · ubicación hace ${data.driver.minutesAgo} min` : " · en vivo"}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-gray-900">Preparando tu pedido…</p>
              <p className="mt-1 text-sm text-gray-500">En cuanto tu repartidor salga, verás aquí su ubicación en vivo.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
