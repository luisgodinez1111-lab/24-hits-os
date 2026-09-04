"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Crosshair } from "lucide-react";
import type { LatLng, Leg } from "@/lib/route";
import { navUrl } from "@/lib/route";
import { loadMaplibre, MAP_STYLE_URL } from "@/lib/maplibre";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

// [lat,lng][] (convención del resto de la app / Leaflet) → [lng,lat][] (GeoJSON/MapLibre).
function toLngLat(pts: [number, number][]): [number, number][] {
  return pts.map(([lat, lng]) => [lng, lat]);
}
function routeFeature(coords: [number, number][], kind: "street" | "straight") {
  return {
    type: "FeatureCollection" as const,
    features: coords.length >= 2 ? [{ type: "Feature" as const, properties: { kind }, geometry: { type: "LineString" as const, coordinates: coords } }] : [],
  };
}
const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

// Motor de rutas público (OSRM demo): traza el recorrido por CALLES desde el
// navegador cuando el backend no manda geometría (OSRM propio aún no montado).
const OSRM_DEMO = "https://router.project-osrm.org";

async function fetchStreetGeometry(pts: LatLng[]): Promise<[number, number][] | null> {
  if (pts.length < 2) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${OSRM_DEMO}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { code?: string; routes?: Array<{ geometry?: { coordinates?: [number, number][] } }> };
    const geo = j.routes?.[0]?.geometry?.coordinates;
    if (j.code !== "Ok" || !geo) return null;
    return geo.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Repartidor: flecha azul que apunta al rumbo (conduciendo) o punto con halo que
// late (quieto). Sobre el mapa oscuro ambos resaltan.
function driverIconHtml(heading: number | null): string {
  if (heading == null) return `<div class="driver-dot"></div>`;
  return `<div style="transform:rotate(${heading}deg);width:32px;height:32px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center">
    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:12px solid #fff;margin-top:-2px"></div>
  </div>`;
}
// Pin de la SIGUIENTE parada (destino): gota índigo con número, resalta en oscuro.
function nextStopEl(n: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:30px;height:38px";
  el.innerHTML = `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#6366f1;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div><div style="position:absolute;top:6px;left:0;width:30px;text-align:center;color:#fff;font:700 13px system-ui">${n}</div>`;
  return el;
}
// Parada siguiente en el orden: chip claro con número (resalta en oscuro).
function stopEl(n: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = "width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 12px system-ui;color:#1e293b;background:#e2e8f0;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)";
  el.textContent = String(n);
  return el;
}

// Mapa navegador de la ruta: MapLibre vectorial con TU estilo self-hosted (R2).
// Tu posición EN VIVO, el orden de paradas numerado y el recorrido por calles
// (línea con casing redondeado, estilo Google/Apple). Follow = sigue al repartidor.
export function RouteMap({ legs, driver, heading = null, geometry, follow = false, headingUp = false, height = "58vh" }: { legs: Leg[]; driver: LatLng | null; heading?: number | null; geometry?: [number, number][] | null; follow?: boolean; headingUp?: boolean; height?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<Awaited<ReturnType<typeof loadMaplibre>> | null>(null);
  const stopMarkersRef = useRef<MlMarker[]>([]);
  const driverMarkerRef = useRef<MlMarker | null>(null);
  const driverElRef = useRef<HTMLDivElement | null>(null);
  const driverPos = useRef<LatLng | null>(null);
  const didFitOnce = useRef(false);
  const followZoomed = useRef(false);
  const [ready, setReady] = useState(false);
  const [fallbackGeom, setFallbackGeom] = useState<[number, number][] | null>(null);
  const [streetStatus, setStreetStatus] = useState<"idle" | "loading" | "ok" | "failed">("idle");

  // Inicializa el mapa (una vez) + capas de la ruta (casing + línea + recta punteada).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maplibregl = await loadMaplibre();
      if (cancelled || !elRef.current || mapRef.current) return;
      mlRef.current = maplibregl;
      const map = new maplibregl.Map({
        container: elRef.current,
        style: MAP_STYLE_URL,
        center: [-106.069, 28.632],
        zoom: 12,
        attributionControl: { compact: true },
      });
      map.on("load", () => {
        if (cancelled) return;
        map.addSource("route", { type: "geojson", data: EMPTY_FC });
        // Casing oscuro debajo + línea índigo brillante encima (por calles).
        map.addLayer({ id: "route-casing", type: "line", source: "route", filter: ["==", ["get", "kind"], "street"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1e1b4b", "line-width": 9, "line-opacity": 0.9 } });
        map.addLayer({ id: "route-line", type: "line", source: "route", filter: ["==", ["get", "kind"], "street"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#818cf8", "line-width": 5 } });
        // Recta aproximada (cuando el motor de calles no responde): punteada tenue.
        map.addLayer({ id: "route-straight", type: "line", source: "route", filter: ["==", ["get", "kind"], "straight"], layout: { "line-cap": "round" }, paint: { "line-color": "#94a3b8", "line-width": 3, "line-opacity": 0.7, "line-dasharray": [2, 2] } });
        map.resize();
        setReady(true);
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      stopMarkersRef.current.forEach((m) => m.remove());
      stopMarkersRef.current = [];
      driverMarkerRef.current?.remove();
      driverMarkerRef.current = null;
      driverElRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      didFitOnce.current = false;
      setReady(false);
    };
  }, []);

  // Trazo por CALLES: si el backend NO manda geometría, la pedimos al motor público.
  const driverKey = driver ? `${driver.lat.toFixed(3)},${driver.lng.toFixed(3)}` : "";
  useEffect(() => {
    if (geometry && geometry.length >= 2) { setFallbackGeom(null); setStreetStatus("ok"); return; }
    const stops = legs.map((l) => l.stop).filter((s) => s.deliveryLat != null && s.deliveryLng != null);
    const waypoints: LatLng[] = [];
    if (driver) waypoints.push({ lat: driver.lat, lng: driver.lng });
    for (const s of stops) waypoints.push({ lat: s.deliveryLat!, lng: s.deliveryLng! });
    if (waypoints.length < 2) { setFallbackGeom(null); setStreetStatus("idle"); return; }
    let cancelled = false;
    setStreetStatus("loading");
    void fetchStreetGeometry(waypoints).then((g) => {
      if (cancelled) return;
      setFallbackGeom(g);
      setStreetStatus(g ? "ok" : "failed");
    });
    return () => { cancelled = true; };
  }, [legs, geometry, driverKey]);

  // Paradas (marcadores numerados) + recorrido (capa de línea).
  useEffect(() => {
    const maplibregl = mlRef.current;
    const map = mapRef.current;
    if (!ready || !maplibregl || !map) return;
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    let hasBounds = false;
    const straightPts: [number, number][] = [];

    legs.forEach(({ stop }, i) => {
      if (stop.deliveryLat == null || stop.deliveryLng == null) return;
      const n = i + 1;
      const el = i === 0 ? nextStopEl(n) : stopEl(n);
      const nav = navUrl(stop);
      const popup =
        `<div style="min-width:150px"><b>${esc(stop.customer?.name ?? "Mostrador")}</b>` +
        `<div style="color:#6b7280;font-size:12px;margin:2px 0">${esc(stop.deliveryAddress ?? "")}</div>` +
        `<div style="font-family:monospace;font-size:11px;color:#9ca3af">#${n} · ${esc(stop.number)}</div>` +
        (nav ? `<a href="${nav}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:6px;color:#4f46e5;font-weight:600">Abrir en Maps &rarr;</a>` : "") +
        `</div>`;
      const marker = new maplibregl.Marker({ element: el, anchor: i === 0 ? "bottom" : "center" })
        .setLngLat([stop.deliveryLng, stop.deliveryLat])
        .setPopup(new maplibregl.Popup({ offset: i === 0 ? 34 : 16 }).setHTML(popup))
        .addTo(map);
      stopMarkersRef.current.push(marker);
      bounds.extend([stop.deliveryLng, stop.deliveryLat]);
      hasBounds = true;
      straightPts.push([stop.deliveryLat, stop.deliveryLng]);
    });

    // El recorrido: por calles si hay geometría (backend o cliente); si no, recta.
    const streets = (geometry && geometry.length >= 2 ? geometry : null) ?? fallbackGeom;
    const src = map.getSource("route") as GeoJSONSource | undefined;
    if (streets && streets.length >= 2) {
      const lngLat = toLngLat(streets);
      src?.setData(routeFeature(lngLat, "street"));
      lngLat.forEach((c) => bounds.extend(c as [number, number]));
      hasBounds = true;
    } else if (straightPts.length >= 2) {
      src?.setData(routeFeature(toLngLat(straightPts), "straight"));
    } else {
      src?.setData(EMPTY_FC);
    }

    // En follow NO reencuadramos: el mapa sigue al repartidor.
    if (follow) return;
    if (driverPos.current) { bounds.extend([driverPos.current.lng, driverPos.current.lat]); hasBounds = true; }
    if (hasBounds) {
      const c = bounds.getCenter();
      if (bounds.getNorthEast().distanceTo(bounds.getSouthWest()) < 1) map.easeTo({ center: c, zoom: 15, duration: 500 });
      else map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 600 });
    }
  }, [ready, legs, geometry, fallbackGeom, follow]);

  // Repartidor EN VIVO + follow/rotación (heading-up).
  useEffect(() => {
    const maplibregl = mlRef.current;
    const map = mapRef.current;
    if (!ready || !maplibregl || !map) return;
    if (!driver) {
      driverMarkerRef.current?.remove();
      driverMarkerRef.current = null;
      driverElRef.current = null;
      driverPos.current = null;
      return;
    }
    driverPos.current = driver;
    // Con heading-up el mapa rota → la flecha va fija arriba; si no, la flecha gira.
    const rotating = follow && headingUp && heading != null;
    const iconHeading = follow ? (rotating ? 0 : heading) : null;

    if (!driverMarkerRef.current) {
      const el = document.createElement("div");
      el.innerHTML = driverIconHtml(iconHeading);
      driverElRef.current = el;
      driverMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([driver.lng, driver.lat])
        .setPopup(new maplibregl.Popup({ offset: 16 }).setHTML("Tú (repartidor)"))
        .addTo(map);
      if (!didFitOnce.current && legs.length === 0) { map.easeTo({ center: [driver.lng, driver.lat], zoom: 15, duration: 500 }); didFitOnce.current = true; }
    } else {
      driverMarkerRef.current.setLngLat([driver.lng, driver.lat]);
      if (driverElRef.current) driverElRef.current.innerHTML = driverIconHtml(iconHeading);
    }

    // Cámara: en follow, paneo (y rotación heading-up) SUAVE tras el zoom inicial.
    const bearing = rotating ? heading! : 0;
    if (follow) {
      if (!followZoomed.current) { map.easeTo({ center: [driver.lng, driver.lat], zoom: 17, bearing, duration: 800 }); followZoomed.current = true; }
      else map.easeTo({ center: [driver.lng, driver.lat], bearing, duration: 700 });
    } else {
      followZoomed.current = false;
      if (map.getBearing() !== 0) map.easeTo({ bearing: 0, duration: 400 });
    }
  }, [ready, driver, heading, follow, headingUp, legs.length]);

  const recenter = () => {
    const map = mapRef.current;
    const d = driverPos.current;
    if (map && d) map.easeTo({ center: [d.lng, d.lat], zoom: 16, duration: 500 });
  };

  return (
    <div className="relative" style={{ height }}>
      <div ref={elRef} style={{ height: "100%", width: "100%", minHeight: 240 }} className="relative z-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100" />
      {streetStatus !== "idle" && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-white/95 px-3 py-1 text-xs font-medium shadow">
          {streetStatus === "loading" && <span className="text-gray-500">Trazando ruta por calles…</span>}
          {streetStatus === "ok" && <span className="text-gray-700">Ruta por calles</span>}
          {streetStatus === "failed" && <span className="text-amber-700">Ruta aproximada (recta) — motor no disponible</span>}
        </div>
      )}
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
