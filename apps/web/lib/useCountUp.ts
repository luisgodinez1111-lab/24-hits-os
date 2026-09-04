"use client";

import { useEffect, useRef, useState } from "react";

// Anima un número desde su valor previo hasta `target` con requestAnimationFrame
// y easing suave (ease-out). Hace que las cifras del dashboard "suban" al cargar
// o al actualizarse → el dato se siente vivo (data-as-hero), maridando con las
// cifras mono + tabular-nums (que evitan el salto de ancho durante el conteo).
//
// Respeta prefers-reduced-motion: si el usuario lo pide, salta al valor final sin
// animar. Si el target no cambia, no re-anima.
export function useCountUp(target: number, durationMs = 650): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Sin animación (o cambio nulo / no finito): fija el valor y termina.
    if (reduce || !Number.isFinite(target) || target === fromRef.current) {
      fromRef.current = target;
      setValue(target);
      return;
    }

    const from = fromRef.current;
    const delta = target - from;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cúbico
      setValue(from + delta * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}
