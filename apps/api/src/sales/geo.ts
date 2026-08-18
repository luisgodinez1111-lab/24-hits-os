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
