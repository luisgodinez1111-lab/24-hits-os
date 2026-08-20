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

// Mapa navegador de la ruta (estilo Uber): tu posición EN VIVO con halo que late,
// las paradas numeradas en orden óptimo, la ruta dibujada y navegación de un
// toque. Se muestra SIEMPRE — aunque no haya paradas centra en tu ubicación.
// Leaflet + OpenStreetMap (sin API key). El marcador del repartidor se actualiza
// en un efecto propio para no re-encuadrar el mapa en cada tick del GPS.
export function RouteMap({ legs, driver, geometry, follow = false, height = "58vh" }: { legs: Leg[]; driver: LatLng | null; geometry?: [number, number][] | null; follow?: boolean; height?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const driverRef = useRef<Marker | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const driverPos = useRef<LatLng | null>(null); // última posición para "recentrar"
  const didFitOnce = useRef(false); // primer encuadre en tu ubicación
  const [ready, setReady] = useState(false);

  // Inicializa el mapa (una vez).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { zoomControl: true }).setView([28.632, -106.069], 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      driverRef.current = null;
      didFitOnce.current = false;
      setReady(false);
    };
  }, []);

  // Paradas + ruta (se redibujan cuando cambia el orden; encuadra paradas + tú).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();

    const bounds: [number, number][] = [];
    const routePts: [number, number][] = [];

    legs.forEach(({ stop }, i) => {
      if (stop.deliveryLat == null || stop.deliveryLng == null) return;
      const n = i + 1;
      const isNext = i === 0;
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 13px system-ui,sans-serif;color:#fff;background:${isNext ? "#7c3aed" : "#4b5563"};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)">${n}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const nav = navUrl(stop);
      const popup =
        `<div style="min-width:150px"><b>${esc(stop.customer?.name ?? "Mostrador")}</b>` +
        `<div style="color:#6b7280;font-size:12px;margin:2px 0">${esc(stop.deliveryAddress ?? "")}</div>` +
        `<div style="font-family:monospace;font-size:11px;color:#9ca3af">#${n} · ${esc(stop.number)}</div>` +
        (nav ? `<a href="${nav}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:6px;color:#7c3aed;font-weight:600">Navegar &rarr;</a>` : "") +
        `</div>`;
      L.marker([stop.deliveryLat, stop.deliveryLng], { icon }).addTo(layer).bindPopup(popup);
      bounds.push([stop.deliveryLat, stop.deliveryLng]);
      routePts.push([stop.deliveryLat, stop.deliveryLng]);
    });

    // Trazo por calles (OSRM) si viene la geometría; si no, línea recta punteada.
    if (geometry && geometry.length >= 2) {
      L.polyline(geometry, { color: "#7c3aed", weight: 4, opacity: 0.85 }).addTo(layer);
    } else if (routePts.length >= 2) {
      L.polyline(routePts, { color: "#7c3aed", weight: 3, opacity: 0.6, dashArray: "6 7" }).addTo(layer);
    }

    // En modo navegación (follow) NO re-encuadramos: el mapa sigue al repartidor.
    if (follow) return;
    // Encuadra incluyendo tu ubicación, para que siempre te veas junto a las paradas.
    const fitBounds = driverPos.current ? [...bounds, [driverPos.current.lat, driverPos.current.lng] as [number, number]] : bounds;
    if (fitBounds.length === 1) map.setView(fitBounds[0]!, 15);
    else if (fitBounds.length > 1) map.fitBounds(fitBounds, { padding: [50, 50], maxZoom: 16 });
  }, [ready, legs, geometry, follow]);

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
      const dot = L.divIcon({
        className: "",
        html: `<div class="driver-dot"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      driverRef.current = L.marker([driver.lat, driver.lng], { icon: dot, zIndexOffset: 1000 }).addTo(map).bindPopup("Tú (repartidor)");
      // Sin paradas todavía: centra el mapa en ti la primera vez que llega el GPS.
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
    if (map && d) map.setView([d.lat, d.lng], 15, { animate: true });
  };

  return (
    <div className="relative">
      <div ref={elRef} style={{ height, width: "100%" }} className="relative z-0 overflow-hidden rounded-xl border border-gray-200" />
      <button
        type="button"
        onClick={recenter}
        aria-label="Centrar en mi ubicación"
        className="absolute bottom-3 right-3 z-[400] grid h-11 w-11 place-items-center rounded-full border border-gray-200 bg-white text-brand shadow-lg active:scale-95"
      >
        <Crosshair className="h-5 w-5" />
      </button>
    </div>
  );
}
