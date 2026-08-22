"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "./route";
import { fetchNavRoute, haversineM, fmtDist, type Maneuver, type NavRoute } from "./navigation";

export interface NavGuidance {
  geometry: [number, number][] | null; // trazo por calles al destino
  maneuver: Maneuver | null; // próxima maniobra
  distToNext: number | null; // metros hasta la próxima maniobra
  arrived: boolean; // ya llegaste al destino
  loading: boolean;
  failed: boolean; // el motor no respondió
}

// Navegación turn-by-turn: pide la ruta con maniobras, sigue tu GPS, avanza la
// instrucción por cercanía, recalcula si te sales, y (opcional) la dice en voz.
export function useNavGuidance(driver: LatLng | null, dest: LatLng | null, active: boolean, voiceOn: boolean): NavGuidance {
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [distToNext, setDistToNext] = useState<number | null>(null);
  const [arrived, setArrived] = useState(false);

  const originRef = useRef<LatLng | null>(null); // desde dónde se calculó la ruta
  const lastRecalc = useRef(0); // throttle de recálculo
  const spokenIdx = useRef(-1); // última maniobra dicha en voz
  const destKey = dest ? `${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}` : "";

  // (Re)calcula la ruta: al activar, al cambiar de destino, o al salirte (abajo).
  const compute = (from: LatLng, to: LatLng) => {
    setLoading(true);
    originRef.current = from;
    lastRecalc.current = Date.now();
    void fetchNavRoute(from, to).then((r) => {
      setRoute(r);
      setLoading(false);
      setFailed(!r);
      setStepIdx(0);
      setArrived(false);
      spokenIdx.current = -1;
    });
  };

  // Primer cálculo / cambio de destino.
  useEffect(() => {
    if (!active || !dest || !driver) { setRoute(null); setFailed(false); return; }
    compute(driver, dest);
    // Solo depende del destino: el recálculo por movimiento se maneja abajo.
  }, [active, destKey]);

  // Voz: habla la maniobra actual una vez.
  const say = (m: Maneuver, dist: number) => {
    if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis) return;
    const prefix = dist > 60 ? `En ${fmtDist(dist)}, ` : "";
    const u = new SpeechSynthesisUtterance(prefix + m.text);
    u.lang = "es-MX";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  // En cada lectura de GPS: avanza la maniobra, calcula distancia, detecta llegada
  // y recalcula si te saliste de la ruta.
  useEffect(() => {
    if (!active || !driver || !dest || !route || route.maneuvers.length === 0) return;

    // Llegada al destino.
    if (haversineM(driver, dest) < 30) {
      if (!arrived) { setArrived(true); if (voiceOn) say(route.maneuvers[route.maneuvers.length - 1]!, 0); }
      return;
    }

    // Avanza el índice al pasar cerca de la maniobra actual.
    let idx = stepIdx;
    while (idx < route.maneuvers.length - 1 && haversineM(driver, route.maneuvers[idx]!) < 30) idx++;
    if (idx !== stepIdx) setStepIdx(idx);

    const m = route.maneuvers[idx]!;
    const d = haversineM(driver, m);
    setDistToNext(d);

    // Habla la instrucción una vez por maniobra (al entrar o al acercarte).
    if (spokenIdx.current !== idx && d < 400) { spokenIdx.current = idx; say(m, d); }

    // ¿Te saliste de la ruta? Distancia mínima al trazo; si es grande, recalcula.
    let minToRoute = Infinity;
    for (const [lat, lng] of route.geometry) {
      const dd = haversineM(driver, { lat, lng });
      if (dd < minToRoute) minToRoute = dd;
      if (minToRoute < 40) break;
    }
    if (minToRoute > 60 && Date.now() - lastRecalc.current > 5000) compute(driver, dest);
  }, [driver?.lat, driver?.lng, route, active]);

  return {
    geometry: route?.geometry ?? null,
    maneuver: route ? route.maneuvers[stepIdx] ?? null : null,
    distToNext,
    arrived,
    loading,
    failed,
  };
}
