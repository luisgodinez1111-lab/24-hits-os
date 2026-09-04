"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DeliveryStop, LiveDriver } from "@/lib/catalog-types";
import { loadMaplibre, MAP_STYLE_URL } from "@/lib/maplibre";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

// Pin de entrega: gota índigo con la punta hacia abajo (ancla en la coordenada).
function stopEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    "width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#4f46e5;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)";
  return el;
}
// Repartidor en vivo: punto azul con halo + etiqueta con su nombre.
function driverEl(name: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center";
  el.innerHTML = `<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb"></div><div style="margin-top:2px;background:#2563eb;color:#fff;font:600 10px system-ui;padding:1px 5px;border-radius:6px;white-space:nowrap">${esc(name)}</div>`;
  return el;
}

// Mapa de seguimiento del dueño: repartidores EN VIVO + entregas pendientes.
// MapLibre GL vectorial con TU estilo self-hosted (R2) — respaldo oscuro si no hay.
export function TrackingMap({ drivers, stops, height = "60vh" }: { drivers: LiveDriver[]; stops: DeliveryStop[]; height?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<Awaited<ReturnType<typeof loadMaplibre>> | null>(null);
  const markersRef = useRef<MlMarker[]>([]);
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
        style: MAP_STYLE_URL,
        center: [-106.069, 28.632], // Chihuahua [lng, lat]
        zoom: 11,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      map.on("load", () => {
        if (cancelled) return;
        map.resize(); // evita el mapa "cortado" si el contenedor cambió de tamaño
        setReady(true);
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
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
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const bounds = new maplibregl.LngLatBounds();
    let n = 0;

    for (const s of stops) {
      if (s.deliveryLat == null || s.deliveryLng == null) continue;
      const marker = new maplibregl.Marker({ element: stopEl(), anchor: "bottom" })
        .setLngLat([s.deliveryLng, s.deliveryLat])
        .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(`<b>${esc(s.customer?.name ?? "Mostrador")}</b><br>${esc(s.deliveryAddress ?? "")}<br>${esc(s.number)}`))
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([s.deliveryLng, s.deliveryLat]);
      n++;
    }
    for (const d of drivers) {
      const marker = new maplibregl.Marker({ element: driverEl(d.name), anchor: "center" })
        .setLngLat([d.lng, d.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${esc(d.name)}</b><br>hace ${d.minutesAgo} min`))
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([d.lng, d.lat]);
      n++;
    }

    // Encuadra una sola vez (no reencuadra en cada poll para no marear al dueño).
    if (!fitted.current && n > 0) {
      if (n === 1) map.easeTo({ center: bounds.getCenter(), zoom: 14, duration: 500 });
      else map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 });
      fitted.current = true;
    }
  }, [ready, drivers, stops]);

  return <div ref={elRef} style={{ height, width: "100%", minHeight: 240 }} className="relative z-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100" />;
}
