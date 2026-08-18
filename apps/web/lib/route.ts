import type { DeliveryStop } from "./catalog-types";

export type LatLng = { lat: number; lng: number };

// Distancia en km (haversine, línea recta) — buena aproximación para ordenar.
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export interface Leg {
  stop: DeliveryStop;
  km: number | null; // distancia al punto anterior (null en la 1ª si no hay origen)
}

// Ordena por VECINO MÁS CERCANO desde `start`; los pedidos sin coordenadas van
// al final. Devuelve cada parada con su distancia al anterior + el total.
export function buildRoute(stops: DeliveryStop[], start: LatLng | null): { legs: Leg[]; noCoords: DeliveryStop[]; totalKm: number } {
  const withCoords = stops.filter(
    (s): s is DeliveryStop & { deliveryLat: number; deliveryLng: number } => s.deliveryLat != null && s.deliveryLng != null
  );
  const noCoords = stops.filter((s) => s.deliveryLat == null || s.deliveryLng == null);

  const legs: Leg[] = [];
  const remaining = [...withCoords];
  let cur: LatLng | null = start ?? (withCoords[0] ? { lat: withCoords[0].deliveryLat, lng: withCoords[0].deliveryLng } : null);
  let totalKm = 0;

  while (remaining.length > 0 && cur) {
    let bestIdx = 0;
    let bestKm = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cur, { lat: remaining[i]!.deliveryLat, lng: remaining[i]!.deliveryLng });
      if (d < bestKm) { bestKm = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    const first = legs.length === 0 && !start;
    legs.push({ stop: next, km: first ? null : bestKm });
    if (!first) totalKm += bestKm;
    cur = { lat: next.deliveryLat, lng: next.deliveryLng };
  }

  return { legs, noCoords, totalKm };
}

// Navegación paso a paso: Apple Maps en iPhone/iPad, Google Maps en el resto.
// Si no hay coordenadas, usa el link original de la entrega.
export function navUrl(stop: DeliveryStop): string | null {
  if (stop.deliveryLat != null && stop.deliveryLng != null) {
    const dest = `${stop.deliveryLat},${stop.deliveryLng}`;
    const isIOS = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);
    return isIOS ? `https://maps.apple.com/?daddr=${dest}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  }
  return stop.deliveryLocationUrl || null;
}
