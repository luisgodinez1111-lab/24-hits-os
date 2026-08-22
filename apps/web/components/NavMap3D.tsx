"use client";

import { useEffect, useRef } from "react";
import type { ExpressionSpecification, Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import type { LatLng } from "@/lib/route";

// Estilo vectorial gratuito (sin token). "positron" = base minimalista (gris
// claro, calles sutiles) tipo Uber — mucho más limpio que "liberty".
const STYLE = "https://tiles.openfreemap.org/styles/positron";

// Cargamos MapLibre desde CDN (no desde el bundle) para que su Web Worker se
// auto-resuelva desde la URL del CDN. Con el bundler de Next el worker no cargaba
// y los tiles no se dibujaban (solo el fondo). Este patrón evita ese problema.
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

// Mapa de navegación 3D (estilo Google más nuevo): MapLibre GL con vista
// inclinada (pitch), rotación heading-up y edificios en 3D. Motor vectorial.
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
  const centeredRef = useRef(false);

  // Init (una vez).
  useEffect(() => {
    let cancelled = false;
    let failTimer: ReturnType<typeof setTimeout> | undefined;
    const resizeTimers: ReturnType<typeof setTimeout>[] = [];
    let erroredOnce = false;
    const fail = () => { if (!erroredOnce) { erroredOnce = true; onError?.(); } };
    void (async () => {
      try {
        const maplibregl = await loadMapLibre();
        if (cancelled || !elRef.current || mapRef.current) return;
        const center: [number, number] = driver ? [driver.lng, driver.lat] : [-106.069, 28.632];
        const map = new maplibregl.Map({
          container: elRef.current,
          style: STYLE,
          center,
          zoom: 17.5,
          pitch: 62, // inclinación 3D cinematográfica
          maxPitch: 85,
          bearing: 0,
          antialias: true, // bordes suaves en los edificios 3D
          attributionControl: { compact: true },
        });
        mapRef.current = map;

        // Si el estilo/worker no carga en 9s, avisamos al padre (→ cae a Leaflet).
        failTimer = setTimeout(() => { if (!readyRef.current) fail(); }, 9000);
        // Error fatal del motor (WebGL/worker/estilo) → fallback.
        map.on("error", (e: { error?: { message?: string } }) => {
          const msg = e?.error?.message ?? "";
          if (!readyRef.current && msg) fail();
        });

        map.on("load", () => {
          if (cancelled) return;
          if (failTimer) clearTimeout(failTimer);
          readyRef.current = true;
          // Igual que Leaflet: recalcular tamaño por si el contenedor arrancó sin él.
          [0, 150, 400].forEach((ms) => resizeTimers.push(setTimeout(() => mapRef.current?.resize(), ms)));

          // Watchdog de tiles: si el worker no procesa ningún tile vectorial en 7s
          // (solo se ve el fondo "crema"), caemos a 2D.
          let tilesOk = false;
          const tilesTimer = setTimeout(() => { if (!tilesOk) fail(); }, 7000);
          resizeTimers.push(tilesTimer);
          map.on("sourcedata", (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
            if (e.sourceId === "openmaptiles" && e.isSourceLoaded) { tilesOk = true; clearTimeout(tilesTimer); }
          });

        const mapAny = map as unknown as {
          setSky?: (s: unknown) => void;
          setLight?: (l: unknown) => void;
        };

        // Cielo con atmósfera → profundidad y horizonte reales (sensación 3D).
        try { mapAny.setSky?.({ "sky-color": "#a9c8ff", "horizon-color": "#eaf1fb", "fog-color": "#eef2f7", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4, "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 12, 0.3] }); } catch { /* estilos/versiones sin sky */ }

        // Iluminación direccional → volumen y sombreado en los edificios.
        try { mapAny.setLight?.({ anchor: "viewport", color: "#ffffff", intensity: 0.5, position: [1.4, 210, 30] }); } catch { /* opcional */ }

        // Edificios en 3D con degradado por altura + sombreado vertical.
        try {
          const layers = (map.getStyle().layers ?? []) as Array<{ id: string; type: string }>;
          const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
          const H = ["coalesce", ["get", "render_height"], ["*", ["coalesce", ["get", "building:levels"], 3], 3], 9] as ExpressionSpecification;
          map.addLayer(
            {
              id: "3d-buildings",
              source: "openmaptiles",
              "source-layer": "building",
              type: "fill-extrusion",
              minzoom: 13,
              paint: {
                // Más altos = un poco más oscuros → sensación de profundidad.
                "fill-extrusion-color": ["interpolate", ["linear"], H, 0, "#eef0f4", 25, "#dfe3ea", 80, "#cbd1db", 200, "#b9c0cc"] as ExpressionSpecification,
                "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.5, H] as ExpressionSpecification,
                "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] as ExpressionSpecification,
                "fill-extrusion-opacity": 0.92,
                "fill-extrusion-vertical-gradient": true,
              },
            },
            firstSymbol
          );
        } catch { /* si el estilo no trae edificios, se omite */ }

        // Ruta estilo Uber: glow azul suave + línea azul nítida encima.
        map.addSource("route", { type: "geojson", data: emptyLine() });
        map.addLayer({ id: "route-glow", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3b82f6", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 8, 18, 22], "line-opacity": 0.28, "line-blur": 6 } });
        map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1e40af", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 6, 18, 14] } });
        map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3b82f6", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3.5, 18, 9] } });

        applyRoute();
        applyDriver(maplibregl);
        applyDest(maplibregl);
        applyCamera();
        });
      } catch {
        fail(); // el import/creación de MapLibre falló → el padre usa Leaflet
      }
    })();
    return () => {
      cancelled = true;
      if (failTimer) clearTimeout(failTimer);
      resizeTimers.forEach(clearTimeout);
      readyRef.current = false;
      centeredRef.current = false;
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
      // Puck de navegación tipo Uber: halo azul suave + disco con degradado y
      // flecha (SVG) blanca. Se acuesta en el piso (rotationAlignment: map).
      el.innerHTML = `<div style="position:relative;width:44px;height:44px">
        <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(closest-side,rgba(59,130,246,.35),rgba(59,130,246,0))"></div>
        <div style="position:absolute;left:7px;top:7px;width:30px;height:30px;border-radius:50%;background:linear-gradient(180deg,#3b82f6,#1d4ed8);border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12 2 L20 21 L12 16 L4 21 Z"/></svg>
        </div></div>`;
      driverRef.current = new maplibregl.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" })
        .setLngLat([driver.lng, driver.lat]).addTo(map);
    } else {
      driverRef.current.setLngLat([driver.lng, driver.lat]);
    }
    driverRef.current?.setRotation(heading ?? 0);
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

  function applyCamera() {
    const map = mapRef.current;
    if (!map || !readyRef.current || !driver) return;
    const bearing = headingUp && heading != null ? heading : 0;
    if (!centeredRef.current) {
      map.jumpTo({ center: [driver.lng, driver.lat], zoom: 17, pitch: 60, bearing });
      centeredRef.current = true;
    } else {
      map.easeTo({ center: [driver.lng, driver.lat], bearing, pitch: 60, duration: 700 });
    }
  }

  // Reaplica al cambiar props (tras el load inicial).
  useEffect(() => { applyRoute(); }, [geometry]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maplibregl = await loadMapLibre();
      if (cancelled) return;
      applyDriver(maplibregl);
      applyDest(maplibregl);
      applyCamera();
    })();
    return () => { cancelled = true; };
  }, [driver?.lat, driver?.lng, heading, headingUp, destination?.lat, destination?.lng]);

  return <div ref={elRef} style={{ height, width: "100%", minHeight: 240 }} className="relative z-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100" />;
}
