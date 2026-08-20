// Extrae coordenadas (lat/lng) de un enlace de mapa o texto. Tolera Google Maps
// y Apple Maps sin problema, además de geo: y coordenadas crudas "lat,lng".
//
// Formatos soportados (ejemplos):
//   Google:  https://maps.google.com/?q=28.63,-106.07
//            https://www.google.com/maps/@28.63,-106.07,15z
//            https://www.google.com/maps/place/.../@28.63,-106.07,17z
//            ...!3d28.63!4d-106.07   (URLs de lugar)
//   Apple:   https://maps.apple.com/?ll=28.63,-106.07
//            https://maps.apple.com/?q=Casa&sll=28.63,-106.07
//            https://maps.apple.com/?daddr=28.63,-106.07&dirflg=d
//   Otros:   geo:28.63,-106.07   ·   "28.63,-106.07"
export function parseLatLng(input: string | null | undefined): { lat: number; lng: number } | null {
  if (!input) return null;
  let s = input.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    // Si el decode falla, seguimos con el original.
  }

  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const patterns: RegExp[] = [
    new RegExp(`!3d${num}!4d${num}`), // Google place pin
    new RegExp(`[?&](?:q|ll|sll|saddr|daddr|destination|center)=${num}\\s*,\\s*${num}`, "i"), // Google + Apple query
    new RegExp(`@${num}\\s*,\\s*${num}`), // Google @lat,lng
    new RegExp(`(?:^|[^\\d.])${num}\\s*,\\s*${num}`), // geo: / crudo / fallback
  ];

  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

// Hosts acortadores/redirect conocidos cuyos links NO llevan las coordenadas
// en el texto: hay que seguir la redirección para obtener la URL larga.
const SHORTENER_RE = /(?:maps\.app\.goo\.gl|goo\.gl|g\.co|share\.google|bit\.ly|tinyurl\.com)/i;

// Resuelve coordenadas de un enlace, incluyendo los LINKS CORTOS de Google Maps
// (maps.app.goo.gl, goo.gl/maps) que da el botón "Compartir": son un redirect
// sin coordenadas, así que se sigue la redirección para obtener la URL larga y
// de ahí se extraen. Si no es un acortador, cae al parseo directo (síncrono).
// Nunca lanza: ante cualquier fallo/timeout devuelve lo que se pueda (o null).
export async function resolveLatLng(input: string | null | undefined): Promise<{ lat: number; lng: number } | null> {
  const direct = parseLatLng(input);
  if (direct || !input) return direct;

  const url = input.trim();
  if (!/^https?:\/\//i.test(url) || !SHORTENER_RE.test(url)) return null;

  try {
    // Sigue la redirección (con timeout) y toma la URL final ya resuelta.
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; 24HitsOS/1.0)" },
    });
    return parseLatLng(res.url) ?? parseLatLng(await res.text());
  } catch {
    return null;
  }
}

// Distancia en km entre dos puntos (haversine, línea recta). Buena aproximación
// para ordenar entregas cercanas sin depender de una API de rutas.
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
