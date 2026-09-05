"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadMaplibre, onThemeChange, styleForTheme } from "@/lib/maplibre";

type Pt = { lat: number; lng: number };

// Mini-mapa del rastreo del cliente: el destino (pin índigo) y el repartidor
// acercándose (punto azul con halo que late). MapLibre + tu estilo self-hosted.
export function TrackMap({ destination, driver, height = "100%" }: { destination: Pt | null; driver: Pt | null; height?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<Awaited<ReturnType<typeof loadMaplibre>> | null>(null);
  const destRef = useRef<MlMarker | null>(null);
  const driverRef = useRef<MlMarker | null>(null);
  const offThemeRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maplibregl = await loadMaplibre();
      if (cancelled || !elRef.current || mapRef.current) return;
      mlRef.current = maplibregl;
      const map = new maplibregl.Map({
        container: elRef.current,
        style: styleForTheme(),
        center: [-106.069, 28.632],
        zoom: 12,
        attributionControl: { compact: true },
      });
      map.on("load", () => { if (!cancelled) { map.resize(); setReady(true); } });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      offThemeRef.current = onThemeChange((dark) => map.setStyle(styleForTheme(dark)));
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      offThemeRef.current?.();
      offThemeRef.current = null;
      destRef.current?.remove();
      driverRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const maplibregl = mlRef.current;
    const map = mapRef.current;
    if (!ready || !maplibregl || !map) return;

    if (destination) {
      if (!destRef.current) {
        const el = document.createElement("div");
        el.style.cssText = "width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#4f46e5;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)";
        destRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([destination.lng, destination.lat]).addTo(map);
      } else destRef.current.setLngLat([destination.lng, destination.lat]);
    }
    if (driver) {
      if (!driverRef.current) {
        const el = document.createElement("div");
        el.className = "driver-dot"; // punto azul con halo que late (globals.css)
        driverRef.current = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([driver.lng, driver.lat]).addTo(map);
      } else driverRef.current.setLngLat([driver.lng, driver.lat]);
    }

    // Encuadra ambos una sola vez; después solo se mueve el repartidor (sin re-encuadrar
    // para no marear al cliente mientras se acerca).
    if (!fitted.current && (destination || driver)) {
      const b = new maplibregl.LngLatBounds();
      if (destination) b.extend([destination.lng, destination.lat]);
      if (driver) b.extend([driver.lng, driver.lat]);
      if (destination && driver) map.fitBounds(b, { padding: 72, maxZoom: 15, duration: 600 });
      else map.easeTo({ center: b.getCenter(), zoom: 14, duration: 500 });
      fitted.current = true;
    }
  }, [ready, destination, driver]);

  return <div ref={elRef} style={{ height, width: "100%" }} />;
}
