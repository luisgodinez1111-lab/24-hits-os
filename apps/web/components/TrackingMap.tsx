"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DeliveryStop, LiveDriver } from "@/lib/catalog-types";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

// Mapa de seguimiento del dueño: repartidores EN VIVO (punto azul con nombre) y
// las entregas pendientes (pines violeta). Leaflet + OpenStreetMap.
export function TrackingMap({ drivers, stops, height = "60vh" }: { drivers: LiveDriver[]; stops: DeliveryStop[]; height?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef(false);

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
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      setReady(false);
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];

    for (const s of stops) {
      if (s.deliveryLat == null || s.deliveryLng == null) continue;
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#7c3aed;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 14],
      });
      L.marker([s.deliveryLat, s.deliveryLng], { icon })
        .addTo(layer)
        .bindPopup(`<b>${esc(s.customer?.name ?? "Mostrador")}</b><br>${esc(s.deliveryAddress ?? "")}<br>${esc(s.number)}`);
      bounds.push([s.deliveryLat, s.deliveryLng]);
    }

    for (const d of drivers) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center"><div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb"></div><div style="margin-top:2px;background:#2563eb;color:#fff;font:600 10px system-ui;padding:1px 5px;border-radius:6px;white-space:nowrap">${esc(d.name)}</div></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker([d.lat, d.lng], { icon, zIndexOffset: 1000 })
        .addTo(layer)
        .bindPopup(`<b>${esc(d.name)}</b><br>hace ${d.minutesAgo} min`);
      bounds.push([d.lat, d.lng]);
    }

    // Encuadra una sola vez (no reencuadra en cada poll para no marear al dueño).
    if (!fitted.current && bounds.length > 0) {
      if (bounds.length === 1) map.setView(bounds[0]!, 14);
      else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      fitted.current = true;
    }
  }, [ready, drivers, stops]);

  return <div ref={elRef} style={{ height, width: "100%" }} className="relative z-0 overflow-hidden rounded-xl border border-gray-200" />;
}
