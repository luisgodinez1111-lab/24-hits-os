import { haversineKm } from "./geo.js";

export type Pt = { lat: number; lng: number };

// Matriz de costos entre N puntos. `dist` en km; `dur` en minutos (solo con OSRM).
export interface CostMatrix {
  dist: number[][];
  dur: number[][] | null;
  provider: "osrm" | "haversine";
}

export function haversineMatrix(pts: Pt[]): CostMatrix {
  const n = pts.length;
  const dist = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(pts[i]!, pts[j]!);
      dist[i]![j] = d;
      dist[j]![i] = d;
    }
  }
  return { dist, dur: null, provider: "haversine" };
}

// Headers opcionales para llegar a un OSRM detrás de Cloudflare Access
// (Service Token). Vacío si no se protege.
export type OsrmHeaders = Record<string, string> | undefined;

// Tope de espera para OSRM. Si el servidor (p.ej. el demo público) no responde a
// tiempo, se aborta y se cae a la matriz haversine (línea recta) al instante, en vez
// de dejar colgada la carga de la ruta.
const OSRM_TIMEOUT_MS = 2500;

async function fetchWithTimeout(url: string, headers: OsrmHeaders | undefined, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Matriz por CARRETERAS vía OSRM (/table). Devuelve null si falla o tarda (→ fallback).
export async function osrmMatrix(pts: Pt[], osrmUrl: string, headers?: OsrmHeaders): Promise<CostMatrix | null> {
  try {
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${osrmUrl.replace(/\/+$/, "")}/table/v1/driving/${coords}?annotations=distance,duration`;
    const res = await fetchWithTimeout(url, headers, OSRM_TIMEOUT_MS);
    if (!res.ok) return null;
    const j = (await res.json()) as { code?: string; distances?: (number | null)[][]; durations?: (number | null)[][] };
    if (j.code !== "Ok" || !j.distances || !j.durations) return null;
    const dist = j.distances.map((row) => row.map((m) => (m == null ? Infinity : m / 1000)));
    const dur = j.durations.map((row) => row.map((s) => (s == null ? Infinity : s / 60)));
    return { dist, dur, provider: "osrm" };
  } catch {
    return null;
  }
}

// Geometría de la ruta por CALLES vía OSRM (/route). Devuelve la polilínea como
// [[lat,lng], …] siguiendo las carreteras, o null si falla (→ línea recta).
export async function osrmRoute(pts: Pt[], osrmUrl: string, headers?: OsrmHeaders): Promise<[number, number][] | null> {
  try {
    if (pts.length < 2) return null;
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${osrmUrl.replace(/\/+$/, "")}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetchWithTimeout(url, headers, OSRM_TIMEOUT_MS);
    if (!res.ok) return null;
    const j = (await res.json()) as { code?: string; routes?: Array<{ geometry?: { coordinates?: [number, number][] } }> };
    const geo = j.routes?.[0]?.geometry?.coordinates;
    if (j.code !== "Ok" || !geo) return null;
    return geo.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch {
    return null;
  }
}

type Cost = (a: number, b: number) => number;

// Tour inicial por vecino más cercano (índice 0 fijo como origen).
export function nearestNeighborPath(n: number, cost: Cost, start = 0): number[] {
  const visited = new Array<boolean>(n).fill(false);
  const order = [start];
  visited[start] = true;
  let cur = start;
  for (let k = 1; k < n; k++) {
    let best = -1;
    let bestC = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j]) {
        const c = cost(cur, j);
        if (c < bestC) { bestC = c; best = j; }
      }
    }
    if (best < 0) break;
    order.push(best);
    visited[best] = true;
    cur = best;
  }
  return order;
}

export function pathCost(order: number[], cost: Cost): number {
  let total = 0;
  for (let i = 1; i < order.length; i++) total += cost(order[i - 1]!, order[i]!);
  return total;
}

// 2-opt para un CAMINO abierto (mantiene fijo order[0], el origen). Invierte
// segmentos mientras reduzca el costo total → orden global casi óptimo.
export function twoOpt(initial: number[], cost: Cost): number[] {
  const order = initial.slice();
  const n = order.length;
  if (n < 4) return order;
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = order[i - 1]!;
        const b = order[i]!;
        const c = order[j]!;
        const d = j + 1 < n ? order[j + 1]! : -1;
        const before = cost(a, b) + (d >= 0 ? cost(c, d) : 0);
        const after = cost(a, c) + (d >= 0 ? cost(b, d) : 0);
        if (after + 1e-9 < before) {
          let lo = i;
          let hi = j;
          while (lo < hi) { const t = order[lo]!; order[lo] = order[hi]!; order[hi] = t; lo++; hi--; }
          improved = true;
        }
      }
    }
  }
  return order;
}

// Optimiza el orden de visita: NN + 2-opt sobre la matriz (usa duración si hay).
export function optimizeOrder(matrix: CostMatrix, n: number): number[] {
  const primary = matrix.dur ?? matrix.dist;
  const cost: Cost = (a, b) => primary[a]![b]!;
  return twoOpt(nearestNeighborPath(n, cost, 0), cost);
}

// Ordena un SUBCONJUNTO de nodos empezando desde `startIdx` (fijo, no incluido
// en la salida): NN + 2-opt. Sirve para optimizar grupos (prioritarios primero,
// luego el resto) encadenando el punto final de uno como inicio del siguiente.
export function optimizeSubset(nodeIdxs: number[], startIdx: number, cost: Cost): number[] {
  if (nodeIdxs.length === 0) return [];
  const remaining = [...nodeIdxs];
  const order: number[] = [];
  let cur = startIdx;
  while (remaining.length > 0) {
    let best = 0;
    let bestC = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = cost(cur, remaining[i]!);
      if (c < bestC) { bestC = c; best = i; }
    }
    const nx = remaining.splice(best, 1)[0]!;
    order.push(nx);
    cur = nx;
  }
  return twoOpt([startIdx, ...order], cost).slice(1);
}
