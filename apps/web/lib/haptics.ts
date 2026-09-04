// Retroalimentación háptica para el POS de mano. Envuelve navigator.vibrate con
// detección de soporte (Android Chrome/PWA sí; iOS Safari no → no-op silencioso).
// Los patrones son cortos e intencionales: confirman la acción sin molestar.
//
// Uso: haptics.tap() al agregar por escaneo, haptics.success() al cobrar,
// haptics.error() cuando algo falla.

type Pattern = number | number[];

// Dispara la vibración si el dispositivo la soporta. Nunca lanza: si el navegador
// no soporta Vibration API (o el gesto no está permitido), simplemente no hace nada.
function buzz(pattern: Pattern): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Algunos navegadores lanzan si no hay activación del usuario; lo ignoramos.
  }
}

export const haptics = {
  /** Tick corto: item agregado al carrito por escaneo. */
  tap: () => buzz(10),
  /** Doble pulso ascendente: operación completada (venta cobrada). */
  success: () => buzz([15, 45, 25]),
  /** Buzz de error: código no reconocido, carrito vacío, fallo de red. */
  error: () => buzz([40, 30, 40]),
  /** Aviso suave: confirmación menor. */
  warn: () => buzz(20),
};
