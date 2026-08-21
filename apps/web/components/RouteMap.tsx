"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair } from "lucide-react";
import type { LatLng, Leg } from "@/lib/route";
import { navUrl } from "@/lib/route";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

// Motor de rutas público (OSRM demo): traza el recorrido por CALLES desde el
// navegador cuando el backend no manda geometría (OSRM propio aún no montado).
// TEMPORAL / solo para ver el trazo — no es para producción a gran volumen.
// El día que haya OSRM_URL propio, el backend manda `geometry` y esto no corre.
const OSRM_DEMO = "https://router.project-osrm.org";

async function fetchStreetGeometry(pts: LatLng[]): Promise<[number, number][] | null> {
  if (pts.length < 2) return null;
  try {
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${OSRM_DEMO}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { code?: string; routes?: Array<{ geometry?: { coordinates?: [number, number][] } }> };
    const geo = j.routes?.[0]?.geometry?.coordinates;
    if (j.code !== "Ok" || !geo) return null;
    return geo.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch {
    return null;
  }
}

// Mapa navegador de la ruta (estilo Uber): base minimalista, tu posición EN VIVO
// con halo que late, el destino como pin negro y el recorrido trazado por las
// calles. Se muestra SIEMPRE — sin paradas centra en tu ubicación.
export function RouteMap({ legs, driver, geometry, follow = false, height = "58vh" }: { legs: Leg[]; driver: LatLng | null; geometry?: [number, number][] | null; follow?: boolean; height?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const driverRef = useRef<Marker | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const driverPos = useRef<LatLng | null>(null); // última posición para "recentrar"
  const didFitOnce = useRef(false); // primer encuadre en tu ubicación
  const [ready, setReady] = useState(false);
  const [fallbackGeom, setFallbackGeom] = useState<[number, number][] | null>(null); // trazo por calles del cliente

  // Inicializa el mapa (una vez).
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView([28.632, -106.069], 12);
      // Base minimalista tipo Uber (CartoDB Positron), sin API key.
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      // Bug clásico de Leaflet en SPA/móvil: el mapa se crea antes de que el
      // contenedor tenga tamaño y sale en blanco. Forzamos recálculo del tamaño.
      const fix = () => map.invalidateSize();
      [50, 200, 500].forEach((ms) => timers.push(setTimeout(fix, ms)));
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      mapRef.current?.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      driverRef.current = null;
      didFitOnce.current = false;
      setReady(false);
    };
  }, []);

  // Recalcula el tamaño del mapa al cambiar el de la ventana (otra causa de blanco).
  useEffect(() => {
    if (!ready) return;
    const onResize = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready]);

  // Trazo por CALLES del cliente: si el backend NO manda geometría, la pedimos al
  // motor público desde el navegador (mirror del backend: desde tu posición por
  // las paradas en orden). Se refresca solo cuando cambia la ruta, no con el GPS.
  useEffect(() => {
    if (geometry && geometry.length >= 2) { setFallbackGeom(null); return; }
    const stops = legs.map((l) => l.stop).filter((s) => s.deliveryLat != null && s.deliveryLng != null);
    if (stops.length < 1) { setFallbackGeom(null); return; }
    const waypoints: LatLng[] = [];
    if (driverPos.current) waypoints.push(driverPos.current);
    for (const s of stops) waypoints.push({ lat: s.deliveryLat!, lng: s.deliveryLng! });
    if (waypoints.length < 2) { setFallbackGeom(null); return; }
    let cancelled = false;
    void fetchStreetGeometry(waypoints).then((g) => { if (!cancelled) setFallbackGeom(g); });
    return () => { cancelled = true; };
    // Nota: intencionalmente NO dependemos de `driver` para no refetch en cada tick.
  }, [legs, geometry]);

  // Paradas + ruta (se redibujan cuando cambia el orden o el trazo).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();

    const bounds: [number, number][] = [];
    const straightPts: [number, number][] = [];

    legs.forEach(({ stop }, i) => {
      if (stop.deliveryLat == null || stop.deliveryLng == null) return;
      const n = i + 1;
      const isNext = i === 0;
      // Siguiente = pin negro grande (destino, estilo Uber); resto = punto gris con número.
      const icon = isNext
        ? L.divIcon({
            className: "",
            html: `<div style="position:relative;width:30px;height:38px">
              <div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#111827;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>
              <div style="position:absolute;top:6px;left:0;width:30px;text-align:center;color:#fff;font:700 13px system-ui">${n}</div>
            </div>`,
            iconSize: [30, 38],
            iconAnchor: [15, 38],
          })
        : L.divIcon({
            className: "",
            html: `<div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 12px system-ui;color:#374151;background:#e5e7eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${n}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });
      const nav = navUrl(stop);
      const popup =
        `<div style="min-width:150px"><b>${esc(stop.customer?.name ?? "Mostrador")}</b>` +
        `<div style="color:#6b7280;font-size:12px;margin:2px 0">${esc(stop.deliveryAddress ?? "")}</div>` +
        `<div style="font-family:monospace;font-size:11px;color:#9ca3af">#${n} · ${esc(stop.number)}</div>` +
        (nav ? `<a href="${nav}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:6px;color:#111827;font-weight:600">Abrir en Maps &rarr;</a>` : "") +
        `</div>`;
      L.marker([stop.deliveryLat, stop.deliveryLng], { icon }).addTo(layer).bindPopup(popup);
      bounds.push([stop.deliveryLat, stop.deliveryLng]);
      straightPts.push([stop.deliveryLat, stop.deliveryLng]);
    });

    // El recorrido: por calles si hay geometría (backend o cliente); si no, recta.
    const streets = (geometry && geometry.length >= 2 ? geometry : null) ?? fallbackGeom;
    if (streets && streets.length >= 2) {
      // Casing estilo Uber: trazo grueso oscuro con un halo blanco debajo.
      L.polyline(streets, { color: "#ffffff", weight: 9, opacity: 0.9, lineJoin: "round", lineCap: "round" }).addTo(layer);
      L.polyline(streets, { color: "#111827", weight: 5, opacity: 0.95, lineJoin: "round", lineCap: "round" }).addTo(layer);
      streets.forEach((p) => bounds.push(p));
    } else if (straightPts.length >= 2) {
      L.polyline(straightPts, { color: "#6b7280", weight: 3, opacity: 0.6, dashArray: "6 7" }).addTo(layer);
    }

    // En modo navegación (follow) NO re-encuadramos: el mapa sigue al repartidor.
    if (follow) return;
    const fitBounds = driverPos.current ? [...bounds, [driverPos.current.lat, driverPos.current.lng] as [number, number]] : bounds;
    if (fitBounds.length === 1) map.setView(fitBounds[0]!, 15);
    else if (fitBounds.length > 1) map.fitBounds(fitBounds, { padding: [50, 50], maxZoom: 16 });
  }, [ready, legs, geometry, fallbackGeom, follow]);

  // Marcador del repartidor EN VIVO (halo que late; solo mueve el punto).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    if (!driver) {
      driverRef.current?.remove();
      driverRef.current = null;
      driverPos.current = null;
      return;
    }
    driverPos.current = driver;
    if (!driverRef.current) {
      const dot = L.divIcon({ className: "", html: `<div class="driver-dot"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
      driverRef.current = L.marker([driver.lat, driver.lng], { icon: dot, zIndexOffset: 1000 }).addTo(map).bindPopup("Tú (repartidor)");
      if (!didFitOnce.current && legs.length === 0) {
        map.setView([driver.lat, driver.lng], 15);
        didFitOnce.current = true;
      }
    } else {
      driverRef.current.setLatLng([driver.lat, driver.lng]);
    }
    // Modo navegación: el mapa persigue al repartidor (zoom cercano), como Uber.
    if (follow) map.setView([driver.lat, driver.lng], Math.max(map.getZoom(), 16), { animate: true });
  }, [ready, driver, follow, legs.length]);

  const recenter = () => {
    const map = mapRef.current;
    const d = driverPos.current;
    if (map && d) map.setView([d.lat, d.lng], 16, { animate: true });
  };

  return (
    <div className="relative">
      <div ref={elRef} style={{ height, width: "100%", minHeight: 240 }} className="relative z-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100" />
      <button
        type="button"
        onClick={recenter}
        aria-label="Centrar en mi ubicación"
        className="absolute bottom-3 right-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-gray-200 bg-white text-brand shadow-lg active:scale-95"
      >
        <Crosshair className="h-5 w-5" />
      </button>
    </div>
  );
}
