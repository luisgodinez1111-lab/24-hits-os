"use client";

import { useEffect, useRef } from "react";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng } from "@/lib/route";

// Estilo vectorial gratuito (sin token). OpenFreeMap = tiles OSM vectoriales.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

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
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !elRef.current || mapRef.current) return;
        const center: [number, number] = driver ? [driver.lng, driver.lat] : [-106.069, 28.632];
        const map = new maplibregl.Map({
          container: elRef.current,
          style: STYLE,
          center,
          zoom: 17,
          pitch: 60, // inclinación 3D (0 = plano, 60 = muy inclinado)
          bearing: 0,
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

        // Edificios en 3D (fill-extrusion) — la sensación "Google 3D".
        try {
          const layers = (map.getStyle().layers ?? []) as Array<{ id: string; type: string }>;
          const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
          map.addLayer(
            {
              id: "3d-buildings",
              source: "openmaptiles",
              "source-layer": "building",
              type: "fill-extrusion",
              minzoom: 14,
              paint: {
                "fill-extrusion-color": "#c9ccd3",
                "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
                "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
                "fill-extrusion-opacity": 0.65,
              },
            },
            firstSymbol
          );
        } catch { /* si el estilo no trae edificios, se omite */ }

        // Fuente + capas de la ruta (casing blanco + línea oscura).
        map.addSource("route", { type: "geojson", data: emptyLine() });
        map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 11 } });
        map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#111827", "line-width": 6 } });

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
      el.innerHTML = `<div style="width:34px;height:34px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center">
        <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:13px solid #fff;margin-top:-2px"></div></div>`;
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
      const maplibregl = await import("maplibre-gl");
      if (cancelled) return;
      applyDriver(maplibregl);
      applyDest(maplibregl);
      applyCamera();
    })();
    return () => { cancelled = true; };
  }, [driver?.lat, driver?.lng, heading, headingUp, destination?.lat, destination?.lng]);

  return <div ref={elRef} style={{ height, width: "100%", minHeight: 240 }} className="relative z-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100" />;
}
