// Clasificador de zona (Chihuahua) por reglas — AUTORIDAD del backend. La UI
// autollena en vivo, pero cualquier alta/edición (también por API) deriva aquí
// la zona desde la dirección cuando no se indica explícitamente. Espejo de
// apps/web/lib/zone.ts; mantener ambos en sincronía.

export type CustomerZone = "NORTE" | "SUR" | "ESTE" | "OESTE" | "CENTRO";

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Colonias/lugares conocidos por sector (minúsculas, sin acentos). Semilla ampliable.
const COLONIAS: Record<CustomerZone, string[]> = {
  CENTRO: ["zona centro", "santo nino", "pacifico", "obrera", "colonia dale", "san felipe viejo"],
  NORTE: ["nombre de dios", "sacramento", "riberas de sacramento", "sahuaros", "cerro grande", "vistas cerro grande", "campanario", "las torres"],
  SUR: ["diaz ordaz", "cerro de la cruz", "junta de los rios", "fovissste sur", "villa residencial del real"],
  ESTE: ["aeropuerto", "robinson", "villa juarez oriente"],
  OESTE: ["san felipe", "tecnologico", "campestre", "country", "quintas del sol", "haciendas del valle"],
};

// Palabras de orientación como respaldo.
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

  for (const zone of ["CENTRO", "NORTE", "SUR", "ESTE", "OESTE"] as CustomerZone[]) {
    if ((COLONIAS[zone] ?? []).some((c) => c && a.includes(c))) return zone;
  }
  for (const { zone, words } of KEYWORDS) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(a))) return zone;
  }
  return null;
}
