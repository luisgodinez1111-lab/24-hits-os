"use client";

import type maplibreglType from "maplibre-gl";

// Fuente única del estilo del mapa para 2D y 3D. Usa TU estilo self-hosted (R2,
// vía NEXT_PUBLIC_MAP_STYLE_URL) o un respaldo oscuro gratuito si no está definido.
const FALLBACK_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
export const MAP_STYLE_URL: string = process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_DARK;
export const HAS_CUSTOM_STYLE: boolean = Boolean(process.env.NEXT_PUBLIC_MAP_STYLE_URL);

let mlPromise: Promise<typeof maplibreglType> | null = null;
let pmtilesRegistered = false;

// Carga MapLibre GL (bundleado, sin CDN) y registra el protocolo pmtiles:// una
// sola vez si el estilo propio lo necesita. Client-only: import dinámico → seguro
// en SSR (maplibre-gl toca window). Reutilizable por todos los mapas.
export async function loadMaplibre(): Promise<typeof maplibreglType> {
  if (!mlPromise) {
    mlPromise = import("maplibre-gl").then((m) => m.default);
  }
  const maplibregl = await mlPromise;
  if (HAS_CUSTOM_STYLE && !pmtilesRegistered) {
    const { Protocol } = await import("pmtiles");
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    pmtilesRegistered = true;
  }
  return maplibregl;
}
