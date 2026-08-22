"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp, ArrowUpLeft, ArrowUpRight, Check, CornerUpLeft, CornerUpRight, Crosshair,
  Flag, MapPin, Navigation2, Phone, RefreshCw, RotateCcw, Route as RouteIcon,
  Volume2, VolumeX, X, type LucideIcon,
} from "lucide-react";
import { Badge, Button, EmptyState, Skeleton } from "@24hits/ui";
import type { CustomerZone, DeliveryStop, OptimizedRoute, OptimizedStop } from "@/lib/catalog-types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { navUrl, type LatLng, type Leg } from "@/lib/route";
import { fmtDist, type ManeuverIcon } from "@/lib/navigation";
import { useNavGuidance } from "@/lib/useNavGuidance";
import { DeliverDialog } from "@/components/DeliverDialog";

// Ícono de la maniobra (flecha de giro).
const MANEUVER_ICONS: Record<ManeuverIcon, LucideIcon> = {
  straight: ArrowUp, left: CornerUpLeft, right: CornerUpRight,
  "slight-left": ArrowUpLeft, "slight-right": ArrowUpRight,
  "sharp-left": CornerUpLeft, "sharp-right": CornerUpRight,
  uturn: RotateCcw, roundabout: RefreshCw, depart: Navigation2, arrive: Flag, merge: ArrowUp,
};

// El mapa solo en cliente (Leaflet usa window).
const RouteMap = dynamic(() => import("@/components/RouteMap").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[58vh] w-full" />,
});

const zoneLabel: Record<CustomerZone, string> = { NORTE: "Norte", SUR: "Sur", ESTE: "Este", OESTE: "Oeste", CENTRO: "Centro" };

// "45 min" / "1h 20m" — cuánto lleva esperando el pedido.
function waited(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Minutos estimados al siguiente punto: usa el tiempo real de OSRM si viene; si
// no, estima con velocidad urbana promedio (~22 km/h, con paradas/semáforos).
function etaMin(stop: OptimizedStop): number | null {
  if (stop.legMin != null) return stop.legMin;
  if (stop.legKm != null) return Math.max(1, Math.round((stop.legKm / 22) * 60));
  return null;
}
// Hora estimada de llegada "14:35" a partir de ahora + minutos.
function arrivalAt(min: number): string {
  return new Date(Date.now() + min * 60000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

// Rumbo en grados (0=N, 90=E) del punto a al b. null si casi no hubo movimiento
// (evita que la flecha gire errático estando quieto).
function bearing(a: LatLng, b: LatLng): number | null {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  // Movimiento mínimo ~5 m para considerar el rumbo válido.
  if (Math.abs(b.lat - a.lat) < 0.00004 && Math.abs(b.lng - a.lng) < 0.00004) return null;
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
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
  const [navMode, setNavMode] = useState(false); // modo navegación in-app (mapa sigue al repartidor)
  const [voiceOn, setVoiceOn] = useState(true); // instrucciones habladas
  const [heading, setHeading] = useState<number | null>(null); // rumbo (grados) para la flecha

  // El backend optimiza (vecino más cercano + 2-opt) desde el origen elegido.
  const { data: route, isLoading } = useQuery({
    queryKey: ["route", start?.lat ?? null, start?.lng ?? null],
    queryFn: () => api.get<OptimizedRoute>(`/orders/route${start ? `?lat=${start.lat}&lng=${start.lng}` : ""}`),
  });

  // GPS EN VIVO: mueve el marcador en cada lectura; fija el origen en la primera
  // (la ruta NO se recalcula en cada tick — eso es bajo demanda, con Recalcular).
  // Además emite la ubicación (throttled ~10s) para el seguimiento del dueño.
  const lastSent = useRef(0);
  const lastPos = useRef<LatLng | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeoMsg("Este dispositivo no permite ubicación."); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude };
        // Rumbo: el del GPS si viene; si no, se calcula del desplazamiento.
        const gpsHeading = typeof p.coords.heading === "number" && !Number.isNaN(p.coords.heading) ? p.coords.heading : null;
        if (gpsHeading != null) setHeading(gpsHeading);
        else if (lastPos.current) {
          const moved = bearing(lastPos.current, c);
          if (moved != null) setHeading(moved);
        }
        lastPos.current = c;
        setPos(c);
        setStart((s) => s ?? c);
        setGeoMsg(null);
        const now = Date.now();
        if (now - lastSent.current > 10000) {
          lastSent.current = now;
          void api.post("/delivery/location", { lat: c.lat, lng: c.lng }).catch(() => undefined);
        }
      },
      () => setGeoMsg("Activa el permiso de ubicación para verte en el mapa. Mientras, la ruta arranca desde el primer pedido."),
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
  const nextStop = stops[0] ?? null; // el siguiente pedido más cercano/prioritario
  const restStops = stops.slice(1);

  // Guía turn-by-turn hacia el siguiente pedido (maniobras + voz). Se llama
  // SIEMPRE (regla de hooks); solo trabaja cuando navMode está activo.
  const navDest = nextStop && nextStop.deliveryLat != null && nextStop.deliveryLng != null
    ? { lat: nextStop.deliveryLat, lng: nextStop.deliveryLng }
    : null;
  const guidance = useNavGuidance(pos, navDest, navMode, voiceOn);

  // MODO NAVEGACIÓN (in-app): banner de maniobra (gira aquí / sigue derecho) +
  // mapa que te sigue con el trazo por calles + bottom-sheet del pedido.
  if (navMode && nextStop) {
    const upcoming = [...restStops, ...noCoords.map(toOptStop)];
    const ManeuverIco = guidance.maneuver ? MANEUVER_ICONS[guidance.maneuver.icon] : Navigation2;
    return (
      <div>
        {/* Banner de maniobra (estilo Google/Uber): qué hacer y a cuántos metros. */}
        <div className="mb-2 flex items-center gap-3 rounded-2xl bg-gray-900 p-4 text-white shadow-md">
          <ManeuverIco className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            {guidance.arrived ? (
              <p className="text-lg font-bold leading-tight">Llegaste a {nextStop.customer?.name ?? "tu destino"}</p>
            ) : guidance.maneuver ? (
              <>
                <p className="text-2xl font-extrabold leading-none tabular-nums">{guidance.distToNext != null ? fmtDist(guidance.distToNext) : ""}</p>
                <p className="truncate text-sm text-gray-200">{guidance.maneuver.text}</p>
              </>
            ) : guidance.loading ? (
              <p className="text-sm text-gray-200">Calculando indicaciones…</p>
            ) : guidance.failed ? (
              <p className="text-sm text-amber-300">Sin indicaciones por voz (motor no disponible). Sigue la línea del mapa.</p>
            ) : (
              <p className="text-sm text-gray-200">Dirígete al destino</p>
            )}
          </div>
          <button
            onClick={() => setVoiceOn((v) => !v)}
            aria-label={voiceOn ? "Silenciar voz" : "Activar voz"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 active:scale-95"
          >
            {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-gray-400" />}
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between gap-2">
          <button onClick={() => setNavMode(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 active:scale-95">
            <X className="h-4 w-4" /> Salir
          </button>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-bold text-brand">Parada 1 de {total}</span>
          <span className="hidden text-sm font-medium text-gray-500 sm:inline">
            {route?.totalKm ? `~${route.totalKm.toFixed(1)} km` : ""}
            {route?.totalMin != null ? ` · ~${route.totalMin} min` : ""} en total
          </span>
        </div>
        <div className="relative">
          <RouteMap legs={legs} driver={pos} heading={heading} geometry={guidance.geometry ?? route?.geometry ?? null} follow height="64vh" />
          <NavSheet stop={nextStop} upcoming={upcoming} onDeliver={() => setDeliverStop(nextStop)} />
        </div>
        <DeliverDialog stopId={deliverStop?.id ?? null} onClose={() => setDeliverStop(null)} onDone={afterDeliver} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><RouteIcon className="h-6 w-6" /> Ruta de hoy</h1>
          <p className="text-sm text-gray-500">
            {total} {total === 1 ? "entrega" : "entregas"}{route && route.totalKm > 0 ? ` · ~${route.totalKm.toFixed(1)} km` : ""}
            {route?.totalMin != null ? ` · ~${route.totalMin} min` : ""}
            {providerLabel ? ` · ruta ${providerLabel}, orden óptimo` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {nextStop && <Button onClick={() => setNavMode(true)}><Navigation2 className="h-4 w-4" /> Iniciar navegación</Button>}
          <Button variant="outline" onClick={recalc}><Crosshair className="h-4 w-4" /> Recalcular</Button>
        </div>
      </div>

      {geoMsg && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{geoMsg}</p>}

      {route && route.priorityCount > 0 && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
          ⚠️ {route.priorityCount} {route.priorityCount === 1 ? "entrega atrasada" : "entregas atrasadas"} — se colocaron primero en la ruta.
        </p>
      )}

      {/* Caso más común de "no veo pines/ruta": los pedidos no tienen ubicación. */}
      {!isLoading && stops.length === 0 && noCoords.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <p className="font-semibold">📍 Tus {noCoords.length} {noCoords.length === 1 ? "pedido no tiene" : "pedidos no tienen"} ubicación en el mapa.</p>
          <p className="mt-1">Para verlos como pines y poder navegar, edita el pedido y pega el <b>link de Google/Apple Maps</b> de la dirección del cliente (o guarda la ubicación en la ficha del cliente). Sin ubicación no se puede trazar la ruta.</p>
        </div>
      )}

      {/* MAPA SIEMPRE VISIBLE (estilo Uber): tu ubicación en vivo + las paradas. */}
      <div className="space-y-4">
        <RouteMap legs={legs} driver={pos} geometry={route?.geometry ?? null} />

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : total === 0 ? (
          <EmptyState
            icon={<MapPin className="h-8 w-8 text-gray-400" />}
            title="Sin entregas pendientes"
            description="Ya te ves en el mapa. Cuando haya pedidos por enviar aparecerán aquí en la ruta más eficiente, empezando por el más cercano."
          />
        ) : (
          <>
            {/* SIGUIENTE PEDIDO — tarjeta grande, lo primero que ves. */}
            {nextStop && <NextCard stop={nextStop} onNavigate={() => setNavMode(true)} onDeliver={() => setDeliverStop(nextStop)} />}

            {/* El resto de la ruta, en orden. */}
            {(restStops.length > 0 || noCoords.length > 0) && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Después ({restStops.length + noCoords.length})</p>
                <ol className="space-y-2">
                  {restStops.map((s, i) => (
                    <Stop key={s.id} n={i + 2} stop={s} onDeliver={() => setDeliverStop(s)} />
                  ))}
                  {noCoords.length > 0 && (
                    <li className="pt-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Sin ubicación en el mapa (pídeles el pin)</p>
                      <div className="space-y-2">
                        {noCoords.map((s) => {
                          const opt = toOptStop(s);
                          return <Stop key={s.id} n={null} stop={opt} onDeliver={() => setDeliverStop(opt)} />;
                        })}
                      </div>
                    </li>
                  )}
                </ol>
              </div>
            )}
          </>
        )}
      </div>

      <DeliverDialog stopId={deliverStop?.id ?? null} onClose={() => setDeliverStop(null)} onDone={afterDeliver} />
    </div>
  );
}

// Tarjeta destacada del siguiente pedido. La acción principal ENTRA a la
// navegación in-app (no lanza a Google Maps).
function NextCard({ stop, onNavigate, onDeliver }: { stop: OptimizedStop; onNavigate: () => void; onDeliver: () => void }) {
  const phone = stop.deliveryPhone || stop.customer?.phone || null;
  return (
    <div className="rounded-2xl border-2 border-brand/40 bg-brand/5 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Badge tone="brand">Siguiente parada</Badge>
        {stop.priority === "urgent" && <Badge tone="red">Urgente · {waited(stop.minutesPending)}</Badge>}
        {stop.priority === "priority" && <Badge tone="amber">Prioritario · {waited(stop.minutesPending)}</Badge>}
        {stop.legKm != null && (
          <span className="ml-auto text-sm font-semibold text-brand">
            {stop.legKm.toFixed(1)} km{stop.legMin != null ? ` · ${stop.legMin} min` : ""}
          </span>
        )}
      </div>
      <p className="text-lg font-bold leading-tight">{stop.customer?.name ?? "Mostrador"}</p>
      <p className="text-sm text-gray-600">{stop.deliveryAddress ?? "Sin dirección"}</p>
      <p className="mt-0.5 font-mono text-xs text-gray-400">
        {stop.number} · {money(stop.total)}
        {stop.customer?.zone ? ` · ${zoneLabel[stop.customer.zone]}` : ""}
        {stop.deliveryNotes ? ` · ${stop.deliveryNotes}` : ""}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button className="col-span-2 sm:col-span-1" onClick={onNavigate}><Navigation2 className="h-4 w-4" /> Iniciar navegación</Button>
        {phone && (
          <a href={`tel:${phone}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 active:scale-95">
            <Phone className="h-4 w-4" /> Llamar
          </a>
        )}
        <button onClick={onDeliver} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 active:scale-95">
          <Check className="h-4 w-4" /> Entregar
        </button>
      </div>
    </div>
  );
}

// Bottom-sheet de navegación (estilo Uber): tiempo/distancia/ETA + info del
// cliente + próximas paradas, encima del mapa. Acción principal "Entregar aquí".
function NavSheet({ stop, upcoming, onDeliver }: { stop: OptimizedStop; upcoming: OptimizedStop[]; onDeliver: () => void }) {
  const phone = stop.deliveryPhone || stop.customer?.phone || null;
  const nav = navUrl(stop);
  const min = etaMin(stop);
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 max-h-[62%] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.14)]">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {stop.priority === "urgent" && <Badge tone="red">Urgente · {waited(stop.minutesPending)}</Badge>}
        {stop.priority === "priority" && <Badge tone="amber">Prioritario · {waited(stop.minutesPending)}</Badge>}
        <span className="text-2xl font-extrabold tabular-nums">{min != null ? `${min} min` : "—"}</span>
        {stop.legKm != null && <span className="text-lg font-semibold text-gray-500">· {stop.legKm.toFixed(1)} km</span>}
        {min != null && <span className="ml-auto text-sm text-gray-400">llegada ~{arrivalAt(min)}</span>}
      </div>
      <p className="mt-1 text-base font-bold leading-tight">{stop.customer?.name ?? "Mostrador"}</p>
      <p className="text-sm text-gray-500">{stop.deliveryAddress ?? "Sin dirección"}</p>
      <p className="font-mono text-xs text-gray-400">{stop.number} · {money(stop.total)}{stop.deliveryNotes ? ` · ${stop.deliveryNotes}` : ""}</p>
      <div className="mt-3 flex items-center gap-2">
        <Button className="flex-1" onClick={onDeliver}><Check className="h-4 w-4" /> Entregar aquí</Button>
        {phone && (
          <a href={`tel:${phone}`} aria-label="Llamar" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gray-300 text-gray-700 active:scale-95">
            <Phone className="h-5 w-5" />
          </a>
        )}
      </div>

      {/* Próximas paradas: para saber la secuencia con muchos pedidos. */}
      {upcoming.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Después ({upcoming.length})</p>
          <ol className="space-y-1.5">
            {upcoming.slice(0, 6).map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">{i + 2}</span>
                <span className="truncate font-medium">{s.customer?.name ?? "Mostrador"}</span>
                <span className="truncate text-gray-400">{s.deliveryAddress ?? "sin ubicación"}</span>
                {s.legKm != null && <span className="ml-auto shrink-0 text-xs text-gray-400">{s.legKm.toFixed(1)} km</span>}
              </li>
            ))}
            {upcoming.length > 6 && <li className="pl-8 text-xs text-gray-400">y {upcoming.length - 6} más…</li>}
          </ol>
        </div>
      )}

      {/* Opción secundaria para quien quiera indicaciones por voz. */}
      {nav && (
        <a href={nav} target="_blank" rel="noreferrer" className="mt-3 block text-center text-xs text-gray-400 underline">
          ¿Prefieres indicaciones por voz? Abrir en Maps
        </a>
      )}
    </div>
  );
}

function Stop({ n, stop, onDeliver }: { n: number | null; stop: OptimizedStop; onDeliver: () => void }) {
  const phone = stop.deliveryPhone || stop.customer?.phone || null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">{n ?? "–"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{stop.customer?.name ?? "Mostrador"}</span>
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
        {phone && <a href={`tel:${phone}`} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"><Phone className="h-4 w-4" /> Llamar</a>}
        <Button size="sm" onClick={onDeliver}><Check className="h-4 w-4" /> Entregar</Button>
      </div>
    </div>
  );
}
