"use client";

import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification, Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import { Crosshair } from "lucide-react";
import type { LatLng } from "@/lib/route";

// Motor MapLibre GL (open source, sin terceros de pago). Cargado desde CDN para
// que su worker se auto-resuelva.
const MAPLIBRE_JS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";

// Estilo del mapa. Se toma de NEXT_PUBLIC_MAP_STYLE_URL → apunta a TU estilo
// self-hosted (tiles propios) cuando lo tengas. Si no, respaldo oscuro gratuito.
const FALLBACK_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CUSTOM_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "";
const STYLE = CUSTOM_STYLE || FALLBACK_DARK;

declare global {
  interface Window {
    maplibregl?: typeof import("maplibre-gl");
    pmtiles?: { Protocol: new () => { tile: unknown } };
  }
}

// Protocolo PMTiles: permite que un estilo apunte a tu archivo .pmtiles propio
// (self-hosted, sin servidor de tiles). Se carga solo si usas un estilo propio.
let pmLoader: Promise<NonNullable<Window["pmtiles"]>> | null = null;
let pmRegistered = false;
function loadPmtiles(): Promise<NonNullable<Window["pmtiles"]>> {
  if (window.pmtiles) return Promise.resolve(window.pmtiles);
  if (pmLoader) return pmLoader;
  pmLoader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js"; s.async = true;
    s.onload = () => (window.pmtiles ? resolve(window.pmtiles) : reject(new Error("pmtiles no definido")));
    s.onerror = () => reject(new Error("no se pudo cargar pmtiles"));
    document.head.appendChild(s);
  });
  return pmLoader;
}

let loaderPromise: Promise<typeof import("maplibre-gl")> | null = null;
function loadGl(): Promise<typeof import("maplibre-gl")> {
  if (typeof window === "undefined") return Promise.reject(new Error("sin window"));
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-gl="maplibre"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = MAPLIBRE_CSS; link.setAttribute("data-gl", "maplibre");
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = MAPLIBRE_JS; script.async = true;
    script.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("maplibregl no definido")));
    script.onerror = () => reject(new Error("no se pudo cargar el motor de mapa desde el CDN"));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

const PITCH = 66; // inclinación alta = vista "en la calle" tipo Uber

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
  const userMovedRef = useRef(false); // el usuario tomó control del mapa (pausa follow)
  const [paused, setPaused] = useState(false); // muestra botón "recentrar"

  // Init (una vez).
  useEffect(() => {
    let cancelled = false;
    let failTimer: ReturnType<typeof setTimeout> | undefined;
    const resizeTimers: ReturnType<typeof setTimeout>[] = [];
    let erroredOnce = false;
    const fail = () => { if (!erroredOnce) { erroredOnce = true; onError?.(); } };

    // Padding: coloca al conductor ABAJO (≈65% de la pantalla) como Uber → ves
    // mucho camino adelante hacia el horizonte; deja ~180 px abajo para la tarjeta.
    const padding = () => {
      const h = elRef.current?.clientHeight ?? 480;
      return { top: Math.round(h * 0.50), bottom: 180, left: 0, right: 0 };
    };

    void (async () => {
      try {
        const maplibregl = await loadGl();
        // Si usas tu estilo propio, registra el protocolo pmtiles:// (self-hosted).
        if (CUSTOM_STYLE && !pmRegistered) {
          try {
            const pm = await loadPmtiles();
            const proto = new pm.Protocol();
            (maplibregl as unknown as { addProtocol: (n: string, f: unknown) => void }).addProtocol("pmtiles", proto.tile);
            pmRegistered = true;
          } catch { /* solo se necesita si tu estilo usa pmtiles:// */ }
        }
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

        // Si el usuario arrastra/zoom/rota con el dedo, pausamos el auto-seguimiento
        // (si no, el mapa "se le escapa"). Reanuda con el botón recentrar.
        (["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const).forEach((ev) => {
          map.on(ev, (e: { originalEvent?: unknown }) => {
            if (e && e.originalEvent) { userMovedRef.current = true; setPaused(true); }
          });
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
          map.on("sourcedata", (e: { isSourceLoaded?: boolean }) => {
            // Cualquier source vectorial que cargue = el motor funciona (robusto
            // ante cualquier estilo, propio o de respaldo).
            if (e.isSourceLoaded) { tilesOk = true; clearTimeout(tilesTimer); }
          });

          const mapAny = map as unknown as { setSky?: (s: unknown) => void; setLight?: (l: unknown) => void };
          // Cielo NOCTURNO con atmósfera → profundidad/horizonte tipo Uber noche.
          try { mapAny.setSky?.({ "sky-color": "#0b1020", "horizon-color": "#1b2740", "fog-color": "#0b1020", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.5, "fog-ground-blend": 0.5 }); } catch { /* versión sin sky */ }
          // Iluminación → volumen en los edificios.
          try { mapAny.setLight?.({ anchor: "viewport", color: "#dbe4ff", intensity: 0.45, position: [1.4, 210, 30] }); } catch { /* opcional */ }

          // Nombres de calle SIEMPRE legibles: etiquetas rectas frente a la cámara
          // (no tumbadas con la perspectiva) — clave para el look Uber.
          try {
            for (const l of (map.getStyle().layers ?? []) as Array<{ id: string; type: string }>) {
              if (l.type !== "symbol") continue;
              try { map.setLayoutProperty(l.id, "text-pitch-alignment", "viewport"); } catch { /* capa sin texto */ }
              try { map.setLayoutProperty(l.id, "text-rotation-alignment", "viewport"); } catch { /* idem */ }
            }
          } catch { /* estilo sin símbolos */ }

          // Edificios 3D con degradado por altura + sombreado vertical. Detecta el
          // source de edificios del estilo (propio o de respaldo) automáticamente.
          try {
            const layers = (map.getStyle().layers ?? []) as Array<{ id: string; type: string; source?: string; "source-layer"?: string }>;
            const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
            const bLayer = layers.find((l) => l["source-layer"] === "building" && l.source);
            const bSource = bLayer?.source ?? "carto";
            const H = ["coalesce", ["get", "render_height"], ["get", "height"], ["*", ["coalesce", ["get", "levels"], ["get", "building:levels"], 3], 3], 12] as ExpressionSpecification;
            map.addLayer(
              {
                id: "3d-buildings", source: bSource, "source-layer": "building", type: "fill-extrusion", minzoom: 13,
                paint: {
                  // Edificios oscuros con degradado por altura (más alto = más claro).
                  "fill-extrusion-color": ["interpolate", ["linear"], H, 0, "#232838", 25, "#2b3247", 80, "#38415a", 200, "#465073"] as ExpressionSpecification,
                  "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.5, H] as ExpressionSpecification,
                  "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] as ExpressionSpecification,
                  "fill-extrusion-opacity": 0.95,
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
              const k = 0.25; // suavizado (más alto = más pegado al GPS, menos lag)
              // Salto grande (>~45 m): ir DIRECTO, sin arrastrar → exactitud.
              if (Math.abs(t.lat - a.lat) > 0.0004 || Math.abs(t.lng - a.lng) > 0.0004) {
                a.lat = t.lat; a.lng = t.lng;
              } else {
                a.lat += (t.lat - a.lat) * k;
                a.lng += (t.lng - a.lng) * k;
              }
              const db = ((t.bearing - a.bearing + 540) % 360) - 180; // giro por el camino corto
              a.bearing = (a.bearing + db * k + 360) % 360;
              driverRef.current?.setLngLat([a.lng, a.lat]);
              driverRef.current?.setRotation(a.bearing);
              // Mueve la cámara solo si el usuario NO tomó control (si no, lo pisa).
              if (!userMovedRef.current) {
                m.jumpTo({ center: [a.lng, a.lat], bearing: headingUpRef.current ? a.bearing : 0, pitch: PITCH, padding: padding() });
              }
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
      el.innerHTML = `<div style="width:28px;height:34px"><div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#f43f5e;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6)"></div></div>`;
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
      const maplibregl = await loadGl().catch(() => null);
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

  const recenter = () => {
    userMovedRef.current = false;
    setPaused(false);
    const m = mapRef.current;
    const a = animRef.current;
    if (m && a) m.easeTo({ center: [a.lng, a.lat], zoom: 18, pitch: PITCH, bearing: headingUpRef.current ? a.bearing : 0, duration: 500 });
  };

  return (
    <div ref={elRef} style={{ height, width: "100%", minHeight: 240 }} className="relative z-0 overflow-hidden bg-[#0b1020]">
      {paused && (
        <button
          onClick={recenter}
          className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand shadow-lg active:scale-95"
        >
          <Crosshair className="h-4 w-4" /> Recentrar
        </button>
      )}
    </div>
  );
}
