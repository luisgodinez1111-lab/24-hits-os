// Convierte una fecha de calendario a los instantes UTC de inicio y fin de ese
// día EN LA ZONA HORARIA del negocio. Sin dependencias externas (usa Intl).
//
// Por qué: los reportes y cortes deben cuadrar con el día local (Chihuahua),
// no con UTC. Un cobro a las 23:30 locales no debe caer en el reporte del día
// siguiente. La fecha de calendario se toma de los componentes UTC del Date
// recibido (el front envía el día elegido como medianoche/fin de día UTC).

function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - instant.getTime();
}

// Instante UTC que corresponde a una hora "de pared" (y-m-d h:m:s.ms) en tz.
// El offset se calcula a segundo entero (Intl no expone ms) y los milisegundos
// se suman al final, para no arrastrar el error de truncamiento.
function wallTimeToUtc(y: number, mo: number, d: number, hh: number, mm: number, ss: number, ms: number, timeZone: string): Date {
  const guessNoMs = Date.UTC(y, mo - 1, d, hh, mm, ss, 0);
  const offset = tzOffsetMs(new Date(guessNoMs), timeZone);
  return new Date(guessNoMs - offset + ms);
}

export function zonedDayStart(calendar: Date, timeZone: string): Date {
  return wallTimeToUtc(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate(), 0, 0, 0, 0, timeZone);
}

export function zonedDayEnd(calendar: Date, timeZone: string): Date {
  return wallTimeToUtc(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate(), 23, 59, 59, 999, timeZone);
}

// Clave de agrupación de un instante en la zona del negocio: "YYYY-MM-DD" (día)
// o "YYYY-MM" (mes). Se usa para bucketizar la serie temporal en hora local.
export function zonedDateKey(instant: Date, timeZone: string, granularity: "day" | "month"): string {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = dtf.formatToParts(instant);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  const ym = `${g("year")}-${g("month")}`;
  return granularity === "month" ? ym : `${ym}-${g("day")}`;
}
