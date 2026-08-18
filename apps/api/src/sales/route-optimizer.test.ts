import { describe, expect, it } from "vitest";
import { haversineMatrix, nearestNeighborPath, optimizeOrder, pathCost, twoOpt, type Pt } from "./route-optimizer.js";

describe("optimizador de ruta (2-opt)", () => {
  it("2-opt mejora (o iguala) al vecino más cercano", () => {
    // Puntos en zig-zag donde el greedy no es óptimo.
    const pts: Pt[] = [
      { lat: 0, lng: 0 }, // origen
      { lat: 0, lng: 3 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ];
    const m = haversineMatrix(pts);
    const cost = (a: number, b: number) => m.dist[a]![b]!;
    const nn = nearestNeighborPath(pts.length, cost, 0);
    const opt = twoOpt(nn, cost);
    expect(pathCost(opt, cost)).toBeLessThanOrEqual(pathCost(nn, cost) + 1e-9);
    // Óptimo real: visitar por longitud creciente (0→2→3→1).
    expect(pathCost(opt, cost)).toBeCloseTo(cost(0, 2) + cost(2, 3) + cost(3, 1), 5);
  });

  it("mantiene el origen fijo y visita todas las paradas", () => {
    const pts: Pt[] = [
      { lat: 28.63, lng: -106.07 },
      { lat: 28.70, lng: -106.10 },
      { lat: 28.60, lng: -106.05 },
      { lat: 28.65, lng: -106.09 },
      { lat: 28.62, lng: -106.02 },
    ];
    const order = optimizeOrder(haversineMatrix(pts), pts.length);
    expect(order[0]).toBe(0); // origen fijo
    expect(new Set(order).size).toBe(pts.length); // todas, sin repetir
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("encuentra el óptimo real en un caso pequeño (fuerza bruta)", () => {
    const pts: Pt[] = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 0, lng: 1 },
      { lat: 2, lng: 2 },
    ];
    const m = haversineMatrix(pts);
    const cost = (a: number, b: number) => m.dist[a]![b]!;
    const opt = optimizeOrder(m, pts.length);
    // Fuerza bruta sobre permutaciones de {1,2,3,4} con 0 fijo.
    const rest = [1, 2, 3, 4];
    let bestCost = Infinity;
    const perms = (arr: number[]): number[][] => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
    for (const p of perms(rest)) bestCost = Math.min(bestCost, pathCost([0, ...p], cost));
    expect(pathCost(opt, cost)).toBeCloseTo(bestCost, 5);
  });
});
