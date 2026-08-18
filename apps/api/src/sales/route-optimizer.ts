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

// Matriz por CARRETERAS vía OSRM (/table). Devuelve null si falla (→ fallback).
export async function osrmMatrix(pts: Pt[], osrmUrl: string): Promise<CostMatrix | null> {
  try {
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${osrmUrl.replace(/\/+$/, "")}/table/v1/driving/${coords}?annotations=distance,duration`;
    const res = await fetch(url);
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
