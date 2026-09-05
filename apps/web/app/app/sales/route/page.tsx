"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp, ArrowUpLeft, ArrowUpRight, Check, CornerUpLeft, CornerUpRight, Crosshair,
  Flag, MapPin, Navigation2, Phone, Power, RefreshCw, RotateCcw, Route as RouteIcon,
  Volume2, VolumeX, Wallet, X, type LucideIcon,
} from "lucide-react";
import { Badge, Button, EmptyState, Skeleton, useToast } from "@24hits/ui";
import type { CustomerZone, DeliveryStop, OptimizedRoute, OptimizedStop } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { useMe, hasPermission } from "@/lib/me";
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

// El mapa solo en cliente (Leaflet/MapLibre usan window).
const RouteMap = dynamic(() => import("@/components/RouteMap").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[58vh] w-full" />,
});
// Mapa 3D vectorial (MapLibre) para el modo navegación.
const NavMap3D = dynamic(() => import("@/components/NavMap3D").then((m) => m.NavMap3D), {
  ssr: false,
  loading: () => <Skeleton className="h-[64vh] w-full" />,
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

// Brújula visual (estilo Google/Waze): la aguja ROJA apunta siempre al Norte real.
// Gira en sentido contrario al rumbo del mapa, así ves hacia dónde queda el Norte
// aunque el mapa esté rotado. Al tocarla cambia la orientación (rumbo-arriba ⇄
// Norte-arriba). En "Norte arriba" la aguja queda vertical y se resalta.
function CompassRose({ bearing, headingUp, onClick }: { bearing: number; headingUp: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={headingUp ? "Brújula: rumbo arriba. Toca para Norte arriba." : "Brújula: Norte arriba. Toca para seguir tu rumbo."}
      title="Brújula · toca para cambiar orientación"
      className="grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white shadow active:scale-95"
    >
      <svg
        width="22" height="22" viewBox="0 0 24 24"
        style={{ transform: `rotate(${-bearing}deg)`, transition: "transform 200ms linear" }}
        aria-hidden
      >
        {/* Aguja norte (roja) y sur (gris), apex al centro. */}
        <polygon points="12,3 8.5,12.5 15.5,12.5" fill="#ef4444" />
        <polygon points="12,21 8.5,11.5 15.5,11.5" fill="#9ca3af" />
        <circle cx="12" cy="12" r="1.4" fill="#374151" />
      </svg>
    </button>
  );
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
  const [headingUp, setHeadingUp] = useState(true); // rotación cámara detrás del carro
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null); // precisión en metros
  const [speedKmh, setSpeedKmh] = useState<number | null>(null); // velocidad (km/h) del GPS
  const [map3dFailed, setMap3dFailed] = useState(false); // el 3D no cargó → usar Leaflet
  const startNav = () => { setMap3dFailed(false); setNavMode(true); };
  // Geofence de llegada: parada cuya llegada ya atendió el repartidor (entregó o
  // pospuso), para no re-avisar; y ref para vibrar una sola vez al entrar al radio.
  const [arrivalAckId, setArrivalAckId] = useState<string | null>(null);
  const buzzedId = useRef<string | null>(null);

  // ¿El usuario puede repartir? (rol Driver o cualquier rol con el permiso
  // orders.deliver: admin, gerente, etc.). Solo estos ven el switch "En línea".
  const { data: me } = useMe();
  const canDeliver = hasPermission(me, "orders.deliver");

  // EN LÍNEA / FUERA DE LÍNEA: cuando está en línea, el repartidor emite su GPS al
  // tablero del dueño; fuera de línea deja de aparecer. El mapa/navegación siguen
  // funcionando en ambos casos (verse a sí mismo no depende de estar en línea).
  const [online, setOnline] = useState(false);
  const onlineRef = useRef(false);
  useEffect(() => { onlineRef.current = online; }, [online]);
  const toggleOnline = () => {
    setOnline((v) => {
      const next = !v;
      if (!next) void api.post("/delivery/offline", {}).catch(() => undefined);
      else if (lastPos.current) void api.post("/delivery/location", lastPos.current).catch(() => undefined);
      return next;
    });
  };
  // Al salir de la página, si quedó en línea, avísale al backend que se va.
  useEffect(() => () => { if (onlineRef.current) void api.post("/delivery/offline", {}).catch(() => undefined); }, []);

  // El backend optimiza (vecino más cercano + 2-opt) desde el origen elegido.
  // staleTime: no recalcular al reabrir la página en 1 min (la optimización + OSRM es
  // cara). keepPreviousData: al llegar el GPS (cambia el origen) o al Recalcular, la
  // ruta anterior SIGUE visible mientras recomputa → no parpadea en blanco.
  const { data: route, isLoading, isFetching } = useQuery({
    queryKey: ["route", start?.lat ?? null, start?.lng ?? null],
    queryFn: () => api.get<OptimizedRoute>(`/orders/route${start ? `?lat=${start.lat}&lng=${start.lng}` : ""}`),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
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
        setGpsAccuracy(typeof p.coords.accuracy === "number" ? p.coords.accuracy : null);
        setSpeedKmh(typeof p.coords.speed === "number" && p.coords.speed >= 0 ? p.coords.speed * 3.6 : null);
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
        // Solo transmite al tablero del dueño cuando está EN LÍNEA (throttled ~10s).
        const now = Date.now();
        if (onlineRef.current && now - lastSent.current > 10000) {
          lastSent.current = now;
          void api.post("/delivery/location", { lat: c.lat, lng: c.lng }).catch(() => undefined);
        }
      },
      () => setGeoMsg("Activa el permiso de ubicación para verte en el mapa. Mientras, la ruta arranca desde el primer pedido."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } // maximumAge:0 = nunca cacheado
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

  // GEOFENCE DE LLEGADA: al entrar al radio del destino (guidance.arrived pasa a
  // true a <30 m) vibra UNA sola vez (Android; iOS lo ignora) para que el
  // repartidor levante la vista. El aviso visual con "Entregar" se muestra abajo.
  useEffect(() => {
    if (!navMode || !guidance.arrived || !nextStop || buzzedId.current === nextStop.id) return;
    buzzedId.current = nextStop.id;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([120, 60, 120]);
  }, [navMode, guidance.arrived, nextStop?.id]);

  // MODO NAVEGACIÓN (in-app): banner de maniobra (gira aquí / sigue derecho) +
  // mapa que te sigue con el trazo por calles + bottom-sheet del pedido.
  if (navMode && nextStop) {
    const upcoming = [...restStops, ...noCoords.map(toOptStop)];
    const ManeuverIco = guidance.maneuver ? MANEUVER_ICONS[guidance.maneuver.icon] : Navigation2;
    return (
      <div className="fixed inset-0 z-30 bg-gray-100">
        {/* MAPA a pantalla completa (inmersivo, tipo Uber). */}
        <div className="absolute inset-0">
          {map3dFailed ? (
            <RouteMap legs={legs} driver={pos} heading={heading} headingUp={headingUp} geometry={guidance.geometry ?? route?.geometry ?? null} follow height="100%" />
          ) : (
            <NavMap3D driver={pos} heading={heading} headingUp={headingUp} geometry={guidance.geometry ?? route?.geometry ?? null} destination={navDest} onError={() => setMap3dFailed(true)} height="100%" />
          )}
        </div>

        {/* OVERLAY SUPERIOR: banner de maniobra + controles, flotando sobre el mapa. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 space-y-2 p-3">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-gray-900/95 p-4 text-white shadow-lg backdrop-blur">
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
                <p className="text-sm text-amber-300">Sin indicaciones por voz. Sigue la línea del mapa.</p>
              ) : (
                <p className="text-sm text-gray-200">Dirígete al destino</p>
              )}
            </div>
            <button onClick={() => setVoiceOn((v) => !v)} aria-label={voiceOn ? "Silenciar voz" : "Activar voz"} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 active:scale-95">
              {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-gray-400" />}
            </button>
          </div>
          {/* Controles: salir · parada · 2D/3D · brújula. */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button onClick={() => setNavMode(false)} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow active:scale-95">
              <X className="h-4 w-4" /> Salir
            </button>
            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-bold text-brand shadow">Parada 1 de {total}</span>
            {canDeliver && (
              <button
                onClick={toggleOnline}
                aria-pressed={online}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow active:scale-95 ${
                  online ? "bg-green-500 text-white" : "bg-white text-gray-500"
                }`}
                title={online ? "En línea (visible para el dueño). Toca para desconectarte." : "Fuera de línea. Toca para conectarte."}
              >
                <span className={`h-2 w-2 rounded-full ${online ? "animate-pulse bg-white" : "bg-gray-400"}`} />
                {online ? "En línea" : "Fuera de línea"}
              </button>
            )}
            {gpsAccuracy != null && gpsAccuracy > 50 && (
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow" title="Precisión del GPS de tu dispositivo">
                GPS ±{Math.round(gpsAccuracy)} m
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setMap3dFailed((v) => !v)} aria-label="Cambiar vista 2D/3D" title="Cambiar vista 2D/3D" className="grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 shadow active:scale-95">
                {map3dFailed ? "3D" : "2D"}
              </button>
              <CompassRose
                bearing={headingUp && heading != null ? heading : 0}
                headingUp={headingUp}
                onClick={() => setHeadingUp((v) => !v)}
              />
            </div>
          </div>
        </div>

        {/* VELOCÍMETRO (estilo Google/CarPlay): círculo con km/h, abajo-izquierda. */}
        {speedKmh != null && (
          <div className="pointer-events-none absolute bottom-[42%] left-4 z-10 grid h-16 w-16 place-items-center rounded-full bg-gray-900/90 text-white shadow-lg backdrop-blur">
            <span className="text-2xl font-extrabold leading-none tabular-nums">{Math.round(speedKmh)}</span>
            <span className="text-[10px] font-semibold text-gray-300">km/h</span>
          </div>
        )}

        {/* TARJETA DE ENTREGA flotando sobre el mapa (integrada). */}
        <NavSheet stop={nextStop} upcoming={upcoming} onDeliver={() => setDeliverStop(nextStop)} />

        {/* GEOFENCE: al llegar (auto-detectado por GPS), aviso grande con acción directa. */}
        {guidance.arrived && arrivalAckId !== nextStop.id && (
          <ArrivalPrompt
            stop={nextStop}
            onDeliver={() => { setArrivalAckId(nextStop.id); setDeliverStop(nextStop); }}
            onDismiss={() => setArrivalAckId(nextStop.id)}
          />
        )}

        <DeliverDialog stopId={deliverStop?.id ?? null} onClose={() => setDeliverStop(null)} onDone={afterDeliver} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-title text-gray-900"><RouteIcon className="h-6 w-6" /> Ruta de hoy</h1>
          <p className="text-sm text-gray-500">
            {total} {total === 1 ? "entrega" : "entregas"}{route && route.totalKm > 0 ? ` · ~${route.totalKm.toFixed(1)} km` : ""}
            {route?.totalMin != null ? ` · ~${route.totalMin} min` : ""}
            {providerLabel ? ` · ruta ${providerLabel}, orden óptimo` : ""}
            {isFetching && !isLoading ? <span className="ml-1 text-brand">· actualizando…</span> : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDeliver && (
            <button
              onClick={toggleOnline}
              aria-pressed={online}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition active:scale-95 ${
                online
                  ? "border-green-300 bg-green-50 text-green-700"
                  : "border-gray-300 bg-white text-gray-500"
              }`}
              title={online ? "Estás visible para el dueño. Toca para desconectarte." : "Actívate para aparecer en el tablero de reparto."}
            >
              <span className={`h-2 w-2 rounded-full ${online ? "animate-pulse bg-green-500" : "bg-gray-400"}`} />
              <Power className="h-4 w-4" /> {online ? "En línea" : "Fuera de línea"}
            </button>
          )}
          {nextStop && <Button onClick={startNav}><Navigation2 className="h-4 w-4" /> Iniciar navegación</Button>}
          <Button variant="outline" onClick={recalc}><Crosshair className="h-4 w-4" /> Recalcular</Button>
        </div>
      </div>

      {/* Corte de efectivo: solo repartidores; se oculta si no traen efectivo pendiente. */}
      {canDeliver && <CashCutCard />}

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
            {nextStop && <NextCard stop={nextStop} onNavigate={startNav} onDeliver={() => setDeliverStop(nextStop)} />}

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

// Corte de efectivo del repartidor: cuánto efectivo de reparto trae sin entregar.
type CashSummary = {
  total: string;
  count: number;
  items: { id: string; amount: string; at: string; number: string | null; customerName: string | null }[];
  openSessions: { id: string; register: string }[];
};

// Tarjeta "Corte de efectivo": aparece cuando el repartidor trae efectivo de reparto
// sin entregar. Muestra el total + desglose y lo entrega a un turno de caja abierto
// (ahí entra al arqueo). Cierra el ciclo del dinero, no solo el de la entrega.
function CashCutCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ["driver-cash-summary"],
    queryFn: () => api.get<CashSummary>("/delivery/cash-summary"),
    refetchInterval: 60_000,
  });
  const [expanded, setExpanded] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const target = sessionId || data?.openSessions[0]?.id || "";
  const handover = useMutation({
    mutationFn: () => api.post<{ handedOver: string; count: number }>("/delivery/cash-handover", { cashSessionId: target }),
    onSuccess: (r) => {
      toast.push(`Entregaste ${money(r.handedOver)} a caja ✓`, "success");
      void qc.invalidateQueries({ queryKey: ["driver-cash-summary"] });
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "No se pudo entregar el efectivo", "error"),
  });

  if (!data || data.count === 0) return null; // sin efectivo pendiente → no estorba
  const sessions = data.openSessions;
  return (
    <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <Wallet className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Efectivo de reparto a entregar</p>
          <p className="font-mono text-2xl font-extrabold tabular-nums text-emerald-900">{money(data.total)}</p>
          <p className="text-xs text-emerald-700/80">{data.count} {data.count === 1 ? "cobro" : "cobros"} en efectivo · aún en tu poder</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {sessions.length > 1 && (
            <select value={target} onChange={(e) => setSessionId(e.target.value)} className="rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-sm text-emerald-900">
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.register}</option>)}
            </select>
          )}
          {sessions.length === 0 ? (
            <span className="max-w-[12rem] text-xs text-emerald-700">Abre un turno de caja para recibir el efectivo.</span>
          ) : (
            <Button size="sm" loading={handover.isPending} onClick={() => handover.mutate()}>
              <Wallet className="h-4 w-4" /> Entregar a caja
            </Button>
          )}
          <button onClick={() => setExpanded((v) => !v)} className="text-xs font-medium text-emerald-700 underline">
            {expanded ? "ocultar" : "detalle"}
          </button>
        </div>
      </div>
      {expanded && (
        <ul className="mt-3 space-y-1 border-t border-emerald-200 pt-3 text-sm">
          {data.items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2 text-emerald-900">
              <span className="truncate">
                <span className="font-mono text-xs text-emerald-700">{it.number ?? "—"}</span>
                {it.customerName ? ` · ${it.customerName}` : ""}
              </span>
              <span className="shrink-0 font-mono tabular-nums">{money(it.amount)}</span>
            </li>
          ))}
        </ul>
      )}
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
        <button data-testid="route-deliver-btn" onClick={onDeliver} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 active:scale-95">
          <Check className="h-4 w-4" /> Entregar
        </button>
      </div>
    </div>
  );
}

// Bottom-sheet de navegación tipo Uber: COMPACTO por defecto (no tapa el mapa)
// y expandible para ver las próximas paradas. Acción principal "Entregar aquí".
function NavSheet({ stop, upcoming, onDeliver }: { stop: OptimizedStop; upcoming: OptimizedStop[]; onDeliver: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const phone = stop.deliveryPhone || stop.customer?.phone || null;
  const nav = navUrl(stop);
  const min = etaMin(stop);
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-gray-200 bg-white p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.18)]">
      <button onClick={() => setExpanded((v) => !v)} className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-gray-300" aria-label="Expandir" />
      {/* Fila compacta: tiempo/km/ETA + prioridad. */}
      <div className="flex items-center gap-2">
        <span className="text-xl font-extrabold tabular-nums">{min != null ? `${min} min` : "—"}</span>
        {stop.legKm != null && <span className="text-sm font-semibold text-gray-500">· {stop.legKm.toFixed(1)} km</span>}
        {stop.priority === "urgent" && <Badge tone="red">Urgente</Badge>}
        {stop.priority === "priority" && <Badge tone="amber">Prioritario</Badge>}
        {min != null && <span className="ml-auto text-xs text-gray-400">llegada ~{arrivalAt(min)}</span>}
      </div>
      <p className="mt-0.5 truncate text-base font-bold leading-tight">{stop.customer?.name ?? "Mostrador"}</p>
      <p className="truncate text-sm text-gray-500">{stop.deliveryAddress ?? "Sin dirección"}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <Button className="flex-1" onClick={onDeliver}><Check className="h-4 w-4" /> Entregar aquí</Button>
        {phone && (
          <a href={`tel:${phone}`} aria-label="Llamar" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gray-300 text-gray-700 active:scale-95">
            <Phone className="h-5 w-5" />
          </a>
        )}
        {upcoming.length > 0 && (
          <button onClick={() => setExpanded((v) => !v)} className="grid h-11 shrink-0 place-items-center rounded-xl border border-gray-300 px-3 text-xs font-semibold text-gray-600 active:scale-95">
            +{upcoming.length}
          </button>
        )}
      </div>

      {/* Detalle expandible: pedido + próximas paradas + voz. */}
      {expanded && (
        <div className="mt-3 max-h-[40vh] overflow-y-auto border-t border-gray-100 pt-3">
          <p className="font-mono text-xs text-gray-400">{stop.number} · {money(stop.total)}{stop.deliveryNotes ? ` · ${stop.deliveryNotes}` : ""}</p>
          {upcoming.length > 0 && (
            <>
              <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Después ({upcoming.length})</p>
              <ol className="space-y-1.5">
                {upcoming.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">{i + 2}</span>
                    <span className="truncate font-medium">{s.customer?.name ?? "Mostrador"}</span>
                    <span className="truncate text-gray-400">{s.deliveryAddress ?? "sin ubicación"}</span>
                    {s.legKm != null && <span className="ml-auto shrink-0 text-xs text-gray-400">{s.legKm.toFixed(1)} km</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {nav && (
            <a href={nav} target="_blank" rel="noreferrer" className="mt-3 block text-center text-xs text-gray-400 underline">
              ¿Prefieres indicaciones por voz? Abrir en Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// Aviso de LLEGADA (geofence): aparece SOLO cuando el GPS detecta que el repartidor
// entró al radio del destino. Un toque grande abre la entrega — sin buscar botones
// mientras maneja. "Aún no" lo pospone (p. ej. sigue buscando dónde estacionarse).
function ArrivalPrompt({ stop, onDeliver, onDismiss }: { stop: OptimizedStop; onDeliver: () => void; onDismiss: () => void }) {
  const name = stop.customer?.name ?? "Mostrador";
  const first = name.split(" ")[0];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 p-3 pb-safe">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-green-200 bg-white p-4 shadow-[0_-6px_28px_rgba(0,0,0,0.24)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-green-100 text-green-600">
            <MapPin className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-green-600">Llegaste</p>
            <p className="truncate text-lg font-bold leading-tight text-gray-900">{name}</p>
            <p className="truncate text-sm text-gray-500">{stop.deliveryAddress ?? stop.number}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button className="flex-1" onClick={onDeliver}><Check className="h-4 w-4" /> Entregar a {first}</Button>
          <button onClick={onDismiss} className="shrink-0 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 active:scale-95">
            Aún no
          </button>
        </div>
      </div>
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
