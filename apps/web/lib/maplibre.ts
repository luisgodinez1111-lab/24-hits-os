"use client";

import type maplibreglType from "maplibre-gl";

// Fuente única del estilo del mapa (2D y 3D), consciente del TEMA de la app.
// Oscuro: TU estilo self-hosted (R2) o respaldo dark-matter. Claro: tu estilo
// claro (explícito, o derivado del oscuro: style.json → style.light.json) o
// respaldo positron. Así el mapa combina con el modo claro/oscuro de la app.
const FALLBACK_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const FALLBACK_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const CUSTOM_DARK = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "";
const CUSTOM_LIGHT = process.env.NEXT_PUBLIC_MAP_STYLE_URL_LIGHT || "";

export const MAP_STYLE_DARK: string = CUSTOM_DARK || FALLBACK_DARK;
// Claro: tu estilo propio si defines NEXT_PUBLIC_MAP_STYLE_URL_LIGHT (súbelo a R2
// como style.light.json); si no, un vector claro (positron) que SIEMPRE carga —
// así el modo claro nunca queda en blanco aunque aún no tengas tu estilo claro.
export const MAP_STYLE_LIGHT: string = CUSTOM_LIGHT || FALLBACK_LIGHT;

// Hay estilo propio (pmtiles://) en algún tema → hay que registrar el protocolo.
export const HAS_CUSTOM_STYLE: boolean = Boolean(CUSTOM_DARK || CUSTOM_LIGHT);

// Tema actual de la app (clase `dark` en <html>, la fija el script de tema).
export function isDarkTheme(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}
export function styleForTheme(dark: boolean = isDarkTheme()): string {
  return dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}

// Observa el cambio de tema (toggle claro/oscuro) y llama al callback con el nuevo
// estado. Devuelve una función para dejar de observar.
export function onThemeChange(cb: (dark: boolean) => void): () => void {
  if (typeof document === "undefined") return () => {};
  let last = isDarkTheme();
  const obs = new MutationObserver(() => {
    const now = isDarkTheme();
    if (now !== last) { last = now; cb(now); }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

let mlPromise: Promise<typeof maplibreglType> | null = null;
let pmtilesRegistered = false;

// Carga MapLibre GL (bundleado, sin CDN) y registra el protocolo pmtiles:// una
// sola vez si algún estilo propio lo necesita. Client-only (import dinámico → SSR-safe).
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
