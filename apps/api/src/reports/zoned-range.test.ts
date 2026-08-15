import { describe, expect, it } from "vitest";
import { zonedDayEnd, zonedDayStart } from "./zoned-range.js";

// Invariante robusta (sin depender del offset exacto del tz DB): el instante
// devuelto, formateado EN esa zona, debe leer 00:00:00 / 23:59:59 del día pedido.
function localParts(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = dtf.formatToParts(instant);
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}:${g("second")}` };
}

const calendar = new Date("2026-08-14T00:00:00.000Z"); // día 14 (componentes UTC)

describe("zoned-range: límites de día en la zona del negocio", () => {
  for (const tz of ["America/Chihuahua", "America/Mexico_City", "UTC", "America/New_York"]) {
    it(`inicio de día 00:00:00 local en ${tz}`, () => {
      const start = zonedDayStart(calendar, tz);
      const { date, time } = localParts(start, tz);
      expect(date).toBe("2026-08-14");
      expect(time).toBe("00:00:00");
    });

    it(`fin de día 23:59:59 local en ${tz}`, () => {
      const end = zonedDayEnd(calendar, tz);
      const { date, time } = localParts(end, tz);
      expect(date).toBe("2026-08-14");
      expect(time).toBe("23:59:59");
    });
  }

  it("una zona al oeste de UTC arranca el día MÁS TARDE en UTC", () => {
    // Chihuahua está detrás de UTC → medianoche local ocurre después en UTC.
    const chih = zonedDayStart(calendar, "America/Chihuahua").getTime();
    const utc = zonedDayStart(calendar, "UTC").getTime();
    expect(chih).toBeGreaterThan(utc);
  });
});
