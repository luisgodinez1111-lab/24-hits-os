import type { LatLng } from "./route";

// Motor de rutas público (OSRM demo). Devuelve el trazo por calles + las
// maniobras paso a paso (turn-by-turn). TEMPORAL: al montar OSRM propio se
// cambia esta URL. Ver infra/osrm.
const OSRM = "https://router.project-osrm.org";

export type ManeuverType =
  | "depart" | "arrive" | "turn" | "continue" | "new name" | "merge"
  | "on ramp" | "off ramp" | "fork" | "end of road" | "roundabout"
  | "rotary" | "roundabout turn" | "notification" | "uturn";

export interface Maneuver {
  lat: number;
  lng: number;
  text: string; // instrucción en español
  street: string; // nombre de la calle del tramo
  distance: number; // metros del tramo que sigue a esta maniobra
  icon: ManeuverIcon;
}

export type ManeuverIcon =
  | "straight" | "left" | "right" | "slight-left" | "slight-right"
  | "sharp-left" | "sharp-right" | "uturn" | "roundabout" | "depart" | "arrive" | "merge";

export interface NavRoute {
  geometry: [number, number][]; // [lat,lng] por calles
  maneuvers: Maneuver[];
  distance: number; // metros totales
  duration: number; // segundos totales
}

// Distancia en metros (haversine).
export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// "800 m" / "1.2 km" — distancia legible para la instrucción.
export function fmtDist(m: number): string {
  if (m < 1000) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// Traduce el tipo/modificador de maniobra de OSRM a español + ícono.
function describe(type: string, modifier: string | undefined, street: string, exit?: number): { text: string; icon: ManeuverIcon } {
  const en = street ? ` por ${street}` : "";
  const hacia = street ? ` hacia ${street}` : "";
  const mod = modifier ?? "";
  const iconFor = (): ManeuverIcon => {
    if (type === "depart") return "depart";
    if (type === "arrive") return "arrive";
    if (type === "roundabout" || type === "rotary" || type === "roundabout turn") return "roundabout";
    if (type === "merge") return "merge";
    if (mod === "uturn") return "uturn";
    if (mod === "left") return "left";
    if (mod === "right") return "right";
    if (mod === "slight left") return "slight-left";
    if (mod === "slight right") return "slight-right";
    if (mod === "sharp left") return "sharp-left";
    if (mod === "sharp right") return "sharp-right";
    return "straight";
  };
  const dir = (): string => {
    switch (mod) {
      case "left": return "gira a la izquierda";
      case "right": return "gira a la derecha";
      case "slight left": return "gira levemente a la izquierda";
      case "slight right": return "gira levemente a la derecha";
      case "sharp left": return "gira cerrado a la izquierda";
      case "sharp right": return "gira cerrado a la derecha";
      case "straight": return "sigue derecho";
      case "uturn": return "da vuelta en U";
      default: return "continúa";
    }
  };

  let text: string;
  switch (type) {
    case "depart": text = `Empieza la ruta${en}`; break;
    case "arrive": text = "Llegaste a tu destino"; break;
    case "turn": text = `${cap(dir())}${en}`; break;
    case "continue": text = `Continúa${en}`; break;
    case "new name": text = `Continúa${en}`; break;
    case "merge": text = `Incorpórate${hacia}`; break;
    case "on ramp": text = `Toma la rampa${hacia}`; break;
    case "off ramp": text = `Toma la salida${hacia}`; break;
    case "fork": text = mod.includes("left") ? `Mantente a la izquierda${en}` : mod.includes("right") ? `Mantente a la derecha${en}` : `Sigue${en}`; break;
    case "end of road": text = `Al final de la calle, ${dir()}${en}`; break;
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      text = exit ? `En la rotonda, toma la salida ${exit}${en}` : `Toma la rotonda${en}`; break;
    default: text = `${cap(dir())}${en}`;
  }
  return { text, icon: iconFor() };
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

// Pide la ruta con maniobras paso a paso entre dos puntos.
export async function fetchNavRoute(from: LatLng, to: LatLng): Promise<NavRoute | null> {
  const ctrl = new AbortController();
  // 4s: el demo público de OSRM suele responder en 1-3s; si tarda más, se aborta y el
  // mapa cae a la línea recta en vez de dejar la navegación trabada hasta 10s.
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance: number; duration: number;
        geometry?: { coordinates?: [number, number][] };
        legs?: Array<{ steps?: Array<{ name?: string; distance: number; maneuver?: { type?: string; modifier?: string; location?: [number, number]; exit?: number } }> }>;
      }>;
    };
    const r = j.routes?.[0];
    if (j.code !== "Ok" || !r?.geometry?.coordinates) return null;

    const geometry = r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    const maneuvers: Maneuver[] = [];
    for (const leg of r.legs ?? []) {
      for (const st of leg.steps ?? []) {
        const loc = st.maneuver?.location;
        if (!loc) continue;
        const { text, icon } = describe(st.maneuver?.type ?? "continue", st.maneuver?.modifier, st.name ?? "", st.maneuver?.exit);
        maneuvers.push({ lat: loc[1], lng: loc[0], text, street: st.name ?? "", distance: st.distance, icon });
      }
    }
    return { geometry, maneuvers, distance: r.distance, duration: r.duration };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
