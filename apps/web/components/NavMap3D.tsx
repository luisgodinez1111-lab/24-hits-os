"use client";

import { useEffect, useRef } from "react";
import type { ExpressionSpecification, Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import type { LatLng } from "@/lib/route";

// Estilo vectorial gratuito (sin token). "positron" = base minimalista (gris
// claro, calles sutiles) tipo Uber — mucho más limpio que "liberty".
const STYLE = "https://tiles.openfreemap.org/styles/positron";

// v4 trae build UMD (define window.maplibregl) y su worker se auto-resuelve
// desde el CDN. La v6 es solo ESM (sin UMD) y por eso no cargaba por <script>.
const CDN_JS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
const CDN_CSS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";

declare global {
  interface Window { maplibregl?: typeof import("maplibre-gl"); }
}

let loaderPromise: Promise<typeof import("maplibre-gl")> | null = null;
function loadMapLibre(): Promise<typeof import("maplibre-gl")> {
  if (typeof window === "undefined") return Promise.reject(new Error("sin window"));
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    if (!document.querySelector("link[data-maplibre]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = CDN_CSS; link.setAttribute("data-maplibre", "1");
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = CDN_JS; script.async = true;
    script.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("maplibregl no definido")));
    script.onerror = () => reject(new Error("no se pudo cargar maplibre-gl desde el CDN"));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

const PITCH = 60;

// Mapa de navegación 3D tipo Uber conductor: cámara en el tercio inferior (ves
// hacia adelante), seguimiento FLUIDO interpolado entre lecturas de GPS, rotación
// heading-up, edificios 3D con volumen y nombres de calle legibles.
export function NavMap3D({ driver, heading, headingUp, geometry, destination, onError, height = "64vh" }: {
  driver: LatLng | null;
  heading: number | null;
  headingUp: boolean;
  geometry: [number, number][] | null; // [lat,lng]
  destination: LatLng | null;
  onError?: () => void; // el 3D no cargó → el padre cae a Leaflet
  height?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const driverRef = useRef<MlMarker | null>(null);
  const destRef = useRef<MlMarker | null>(null);
  const readyRef = useRef(false);

  // Estado para la animación de cámara fluida (interpola entre lecturas de GPS).
  const targetRef = useRef<{ lat: number; lng: number; bearing: number } | null>(null); // último GPS
  const animRef = useRef<{ lat: number; lng: number; bearing: number } | null>(null); // valor animado
  const rafRef = useRef<number | null>(null);
  const headingUpRef = useRef(headingUp);
  headingUpRef.current = headingUp;

  // Init (una vez).
  useEffect(() => {
    let cancelled = false;
    let failTimer: ReturnType<typeof setTimeout> | undefined;
    const resizeTimers: ReturnType<typeof setTimeout>[] = [];
    let erroredOnce = false;
    const fail = () => { if (!erroredOnce) { erroredOnce = true; onError?.(); } };

    // Padding: coloca el centro (el conductor) en el TERCIO INFERIOR → ves adelante.
    const padding = () => {
      const h = elRef.current?.clientHeight ?? 480;
      return { top: Math.round(h * 0.58), bottom: 24, left: 0, right: 0 };
    };

    void (async () => {
      try {
        const maplibregl = await loadMapLibre();
        if (cancelled || !elRef.current || mapRef.current) return;
        const center: [number, number] = driver ? [driver.lng, driver.lat] : [-106.069, 28.632];
        const map = new maplibregl.Map({
          container: elRef.current,
          style: STYLE,
          center,
          zoom: 18,
          pitch: PITCH,
          maxPitch: 85,
          bearing: 0,
          antialias: true,
          attributionControl: { compact: true },
        });
        mapRef.current = map;

        failTimer = setTimeout(() => { if (!readyRef.current) fail(); }, 9000);
        map.on("error", (e: { error?: { message?: string } }) => {
          if (!readyRef.current && (e?.error?.message ?? "")) fail();
        });

        map.on("load", () => {
          if (cancelled) return;
          if (failTimer) clearTimeout(failTimer);
          readyRef.current = true;
          [0, 150, 400].forEach((ms) => resizeTimers.push(setTimeout(() => mapRef.current?.resize(), ms)));

          // Watchdog de tiles: si no se procesa ningún tile en 7s (fondo "crema"), cae a 2D.
          let tilesOk = false;
          const tilesTimer = setTimeout(() => { if (!tilesOk) fail(); }, 7000);
          resizeTimers.push(tilesTimer);
          map.on("sourcedata", (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
            if (e.sourceId === "openmaptiles" && e.isSourceLoaded) { tilesOk = true; clearTimeout(tilesTimer); }
          });

          const mapAny = map as unknown as { setSky?: (s: unknown) => void; setLight?: (l: unknown) => void };
          // Cielo con atmósfera → profundidad/horizonte reales.
          try { mapAny.setSky?.({ "sky-color": "#a9c8ff", "horizon-color": "#eaf1fb", "fog-color": "#eef2f7", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4 }); } catch { /* versión sin sky */ }
          // Iluminación → volumen en los edificios.
          try { mapAny.setLight?.({ anchor: "viewport", color: "#ffffff", intensity: 0.5, position: [1.4, 210, 30] }); } catch { /* opcional */ }

          // Nombres de calle SIEMPRE legibles: etiquetas rectas frente a la cámara
          // (no tumbadas con la perspectiva) — clave para el look Uber.
          try {
            for (const l of (map.getStyle().layers ?? []) as Array<{ id: string; type: string }>) {
              if (l.type !== "symbol") continue;
              try { map.setLayoutProperty(l.id, "text-pitch-alignment", "viewport"); } catch { /* capa sin texto */ }
              try { map.setLayoutProperty(l.id, "text-rotation-alignment", "viewport"); } catch { /* idem */ }
            }
          } catch { /* estilo sin símbolos */ }

          // Edificios 3D con degradado por altura + sombreado vertical.
          try {
            const layers = (map.getStyle().layers ?? []) as Array<{ id: string; type: string }>;
            const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
            const H = ["coalesce", ["get", "render_height"], ["*", ["coalesce", ["get", "building:levels"], 3], 3], 9] as ExpressionSpecification;
            map.addLayer(
              {
                id: "3d-buildings", source: "openmaptiles", "source-layer": "building", type: "fill-extrusion", minzoom: 13,
                paint: {
                  "fill-extrusion-color": ["interpolate", ["linear"], H, 0, "#eef0f4", 25, "#dfe3ea", 80, "#cbd1db", 200, "#b9c0cc"] as ExpressionSpecification,
                  "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.5, H] as ExpressionSpecification,
                  "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] as ExpressionSpecification,
                  "fill-extrusion-opacity": 0.92,
                  "fill-extrusion-vertical-gradient": true,
                },
              },
              firstSymbol
            );
          } catch { /* estilo sin edificios */ }

          // Ruta estilo Uber: glow azul + casing + línea azul nítida.
          map.addSource("route", { type: "geojson", data: emptyLine() });
          map.addLayer({ id: "route-glow", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3b82f6", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 8, 18, 22] as ExpressionSpecification, "line-opacity": 0.28, "line-blur": 6 } });
          map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1e40af", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 6, 18, 14] as ExpressionSpecification } });
          map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3b82f6", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3.5, 18, 9] as ExpressionSpecification } });

          applyRoute();
          applyDriver(maplibregl);
          applyDest(maplibregl);

          // Semilla de la cámara y arranque del bucle de seguimiento fluido.
          if (driver) {
            targetRef.current = { lat: driver.lat, lng: driver.lng, bearing: heading ?? 0 };
            animRef.current = { ...targetRef.current };
            map.jumpTo({ center: [driver.lng, driver.lat], bearing: headingUp && heading != null ? heading : 0, pitch: PITCH, zoom: 18, padding: padding() });
          }

          // Bucle: interpola posición y rumbo hacia el último GPS → cámara y punto
          // se DESLIZAN (no saltan) = sensación de precisión tipo Uber.
          const tick = () => {
            const m = mapRef.current;
            const t = targetRef.current;
            if (m && t) {
              if (!animRef.current) animRef.current = { ...t };
              const a = animRef.current;
              const k = 0.16; // suavizado (más alto = más pegado al GPS)
              a.lat += (t.lat - a.lat) * k;
              a.lng += (t.lng - a.lng) * k;
              const db = ((t.bearing - a.bearing + 540) % 360) - 180; // giro por el camino corto
              a.bearing = (a.bearing + db * k + 360) % 360;
              driverRef.current?.setLngLat([a.lng, a.lat]);
              driverRef.current?.setRotation(a.bearing);
              m.jumpTo({ center: [a.lng, a.lat], bearing: headingUpRef.current ? a.bearing : 0, pitch: PITCH, padding: padding() });
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        });
      } catch {
        fail();
      }
    })();
    return () => {
      cancelled = true;
      if (failTimer) clearTimeout(failTimer);
      resizeTimers.forEach(clearTimeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      readyRef.current = false;
      targetRef.current = null;
      animRef.current = null;
      driverRef.current = null;
      destRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  function emptyLine() {
    return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: [] as [number, number][] } };
  }

  function applyRoute() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("route") as { setData: (d: unknown) => void } | undefined;
    if (!src) return;
    const coords = (geometry ?? []).map(([lat, lng]) => [lng, lat] as [number, number]);
    src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }

  function applyDriver(maplibregl: typeof import("maplibre-gl")) {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (!driver) { driverRef.current?.remove(); driverRef.current = null; return; }
    if (!driverRef.current) {
      const el = document.createElement("div");
      // Puck de navegación tipo Uber: halo azul + disco con degradado y flecha.
      el.innerHTML = `<div style="position:relative;width:44px;height:44px">
        <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(closest-side,rgba(59,130,246,.35),rgba(59,130,246,0))"></div>
        <div style="position:absolute;left:7px;top:7px;width:30px;height:30px;border-radius:50%;background:linear-gradient(180deg,#3b82f6,#1d4ed8);border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12 2 L20 21 L12 16 L4 21 Z"/></svg>
        </div></div>`;
      driverRef.current = new maplibregl.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" })
        .setLngLat([driver.lng, driver.lat]).addTo(map);
    }
  }

  function applyDest(maplibregl: typeof import("maplibre-gl")) {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (!destination) { destRef.current?.remove(); destRef.current = null; return; }
    if (!destRef.current) {
      const el = document.createElement("div");
      el.innerHTML = `<div style="width:26px;height:32px"><div style="width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#111827;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></div></div>`;
      destRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([destination.lng, destination.lat]).addTo(map);
    } else {
      destRef.current.setLngLat([destination.lng, destination.lat]);
    }
  }

  // Reaplica al cambiar props. El movimiento de cámara/punto lo hace el bucle RAF;
  // aquí solo actualizamos el objetivo (último GPS) y la ruta/destino.
  useEffect(() => { applyRoute(); }, [geometry]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maplibregl = await loadMapLibre().catch(() => null);
      if (cancelled || !maplibregl) return;
      applyDriver(maplibregl);
      applyDest(maplibregl);
      if (driver) {
        const prev = targetRef.current;
        targetRef.current = { lat: driver.lat, lng: driver.lng, bearing: heading ?? prev?.bearing ?? 0 };
        if (!animRef.current) animRef.current = { ...targetRef.current };
      }
    })();
    return () => { cancelled = true; };
  }, [driver?.lat, driver?.lng, heading, destination?.lat, destination?.lng]);

  return <div ref={elRef} style={{ height, width: "100%", minHeight: 240 }} className="relative z-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100" />;
}
