import type { CustomerZone } from "./catalog-types";

// Clasificador de zona (Chihuahua) por reglas, sin costo. Deriva la zona de la
// dirección: primero por colonias/lugares conocidos, luego por palabras clave de
// orientación (norte/sur/oriente/poniente/centro). Si no reconoce nada devuelve
// null y el usuario la elige/corrige a mano.
//
// La lista de colonias es una SEMILLA extensible: agrega aquí las que uses más
// para mejorar la precisión con el tiempo.

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Colonias/lugares conocidos por sector (nombres en minúsculas, sin acentos).
const COLONIAS: Record<CustomerZone, string[]> = {
  CENTRO: ["zona centro", "santo nino", "pacifico", "obrera", "colonia dale", "san felipe viejo"],
  NORTE: ["nombre de dios", "sacramento", "riberas de sacramento", "sahuaros", "cerro grande", "vistas cerro grande", "campanario", "las torres"],
  SUR: ["diaz ordaz", "cerro de la cruz", "junta de los rios", "fovissste sur", "villa residencial del real"],
  ESTE: ["aeropuerto", "robinson", "villa juarez oriente"],
  OESTE: ["san felipe", "tecnologico", "campestre", "country", "quintas del sol", "haciendas del valle"],
};

// Palabras de orientación como respaldo (después de intentar por colonia).
const KEYWORDS: Array<{ zone: CustomerZone; words: string[] }> = [
  { zone: "CENTRO", words: ["centro"] },
  { zone: "NORTE", words: ["norte"] },
  { zone: "SUR", words: ["sur"] },
  { zone: "ESTE", words: ["oriente", "este"] },
  { zone: "OESTE", words: ["poniente", "oeste"] },
];

export function classifyZone(address: string): CustomerZone | null {
  const a = normalize(address);
  if (!a.trim()) return null;

  // 1) Colonias/lugares conocidos (más específico primero).
  for (const zone of ["CENTRO", "NORTE", "SUR", "ESTE", "OESTE"] as CustomerZone[]) {
    const list = COLONIAS[zone] ?? [];
    if (list.some((c) => c && a.includes(c))) return zone;
  }

  // 2) Palabras de orientación explícitas.
  for (const { zone, words } of KEYWORDS) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(a))) return zone;
  }

  return null;
}
