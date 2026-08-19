"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crosshair, MapPin, Navigation, Phone, Route as RouteIcon } from "lucide-react";
import { Badge, Button, EmptyState, Skeleton } from "@24hits/ui";
import type { CustomerZone, DeliveryStop, OptimizedRoute, OptimizedStop } from "@/lib/catalog-types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { navUrl, type LatLng, type Leg } from "@/lib/route";
import { DeliverDialog } from "@/components/DeliverDialog";

// El mapa solo en cliente (Leaflet usa window).
const RouteMap = dynamic(() => import("@/components/RouteMap").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[56vh] w-full" />,
});

const zoneLabel: Record<CustomerZone, string> = { NORTE: "Norte", SUR: "Sur", ESTE: "Este", OESTE: "Oeste", CENTRO: "Centro" };

// "45 min" / "1h 20m" — cuánto lleva esperando el pedido.
function waited(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Convierte una parada sin coordenadas en OptimizedStop (prioridad calculada en el front).
function toOptStop(s: DeliveryStop): OptimizedStop {
  const minutesPending = Math.round((Date.now() - new Date(s.createdAt).getTime()) / 60000);
  const priority = minutesPending >= 90 ? "urgent" : minutesPending >= 45 ? "priority" : null;
  return { ...s, legKm: null, legMin: null, priority, minutesPending };
}

export default function RoutePage() {
  const qc = useQueryClient();
  const [pos, setPos] = useState<LatLng | null>(null); // posición EN VIVO (marcador)
  const [start, setStart] = useState<LatLng | null>(null); // origen para optimizar (bajo demanda)
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [deliverStop, setDeliverStop] = useState<OptimizedStop | null>(null);

  // El backend optimiza (vecino más cercano + 2-opt) desde el origen elegido.
  const { data: route, isLoading } = useQuery({
    queryKey: ["route", start?.lat ?? null, start?.lng ?? null],
    queryFn: () => api.get<OptimizedRoute>(`/orders/route${start ? `?lat=${start.lat}&lng=${start.lng}` : ""}`),
  });

  // GPS EN VIVO: mueve el marcador en cada lectura; fija el origen en la primera
  // (la ruta NO se recalcula en cada tick — eso es bajo demanda, con Recalcular).
  // Además emite la ubicación (throttled ~10s) para el seguimiento del dueño.
  const lastSent = useRef(0);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeoMsg("Este dispositivo no permite ubicación."); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(c);
        setStart((s) => s ?? c);
        setGeoMsg(null);
        const now = Date.now();
        if (now - lastSent.current > 10000) {
          lastSent.current = now;
          void api.post("/delivery/location", { lat: c.lat, lng: c.lng }).catch(() => undefined);
        }
      },
      () => setGeoMsg("Sin permiso de ubicación: la ruta arranca desde el primer pedido."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const recalc = () => { if (pos) setStart(pos); void qc.invalidateQueries({ queryKey: ["route"] }); };

  // Tras entregar+cobrar, re-optimiza desde donde estás y refresca la ruta.
  const afterDeliver = async () => {
    setDeliverStop(null);
    if (pos) setStart(pos);
    await qc.invalidateQueries({ queryKey: ["route"] });
  };

  const stops: OptimizedStop[] = route?.stops ?? [];
  const legs: Leg[] = stops.map((s) => ({ stop: s, km: s.legKm }));
  const noCoords = route?.noCoords ?? [];
  const total = stops.length + noCoords.length;
  const providerLabel = route?.provider === "osrm" ? "por calles" : route?.provider === "haversine" ? "línea recta" : "";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><RouteIcon className="h-6 w-6" /> Ruta de hoy</h1>
          <p className="text-sm text-gray-500">
            {total} entregas{route && route.totalKm > 0 ? ` · ~${route.totalKm.toFixed(1)} km` : ""}
            {route?.totalMin != null ? ` · ~${route.totalMin} min` : ""}
            {providerLabel ? ` · ruta ${providerLabel}, orden óptimo` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={recalc}><Crosshair className="h-4 w-4" /> Recalcular</Button>
      </div>

      {geoMsg && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{geoMsg}</p>}

      {route && route.priorityCount > 0 && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
          ⚠️ {route.priorityCount} {route.priorityCount === 1 ? "entrega atrasada" : "entregas atrasadas"} — se colocaron primero en la ruta.
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : total === 0 ? (
        <EmptyState icon={<MapPin className="h-8 w-8 text-gray-400" />} title="Sin entregas pendientes" description="Cuando haya pedidos por enviar, aparecerán aquí en la ruta más eficiente." />
      ) : (
        <div className="space-y-4">
          {legs.length > 0 && <RouteMap legs={legs} driver={pos} geometry={route?.geometry ?? null} />}

          <ol className="space-y-2">
            {stops.map((s, i) => (
              <Stop key={s.id} n={i + 1} stop={s} next={i === 0} onDeliver={() => setDeliverStop(s)} />
            ))}
            {noCoords.length > 0 && (
              <li className="pt-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Sin ubicación en el mapa (pídeles el pin)</p>
                <div className="space-y-2">
                  {noCoords.map((s) => {
                    const opt = toOptStop(s);
                    return <Stop key={s.id} n={null} stop={opt} next={false} onDeliver={() => setDeliverStop(opt)} />;
                  })}
                </div>
              </li>
            )}
          </ol>
        </div>
      )}

      <DeliverDialog stopId={deliverStop?.id ?? null} onClose={() => setDeliverStop(null)} onDone={afterDeliver} />
    </div>
  );
}

function Stop({ n, stop, next, onDeliver }: { n: number | null; stop: OptimizedStop; next: boolean; onDeliver: () => void }) {
  const nav = navUrl(stop);
  const phone = stop.deliveryPhone || stop.customer?.phone || null;
  return (
    <div className={`rounded-xl border p-3 ${next ? "border-brand/40 bg-brand/5" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${next ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}>{n ?? "–"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{stop.customer?.name ?? "Mostrador"}</span>
            {next && <Badge tone="brand">siguiente</Badge>}
            {stop.priority === "urgent" && <Badge tone="red">Urgente · {waited(stop.minutesPending)}</Badge>}
            {stop.priority === "priority" && <Badge tone="amber">Prioritario · {waited(stop.minutesPending)}</Badge>}
            {stop.customer?.zone && <Badge tone="gray">{zoneLabel[stop.customer.zone]}</Badge>}
            {stop.legKm != null && (
              <span className="ml-auto text-xs font-medium text-gray-500">
                {stop.legKm.toFixed(1)} km{stop.legMin != null ? ` · ${stop.legMin} min` : ""}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-gray-500">{stop.deliveryAddress ?? "Sin dirección"}</p>
          <p className="font-mono text-xs text-gray-400">{stop.number} · {money(stop.total)}{stop.deliveryNotes ? ` · ${stop.deliveryNotes}` : ""}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {nav && <a href={nav} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"><Navigation className="h-4 w-4" /> Navegar</a>}
        {phone && <a href={`tel:${phone}`} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"><Phone className="h-4 w-4" /> Llamar</a>}
        <Button size="sm" onClick={onDeliver}><Check className="h-4 w-4" /> Entregar</Button>
      </div>
    </div>
  );
}
