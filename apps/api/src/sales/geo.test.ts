import { describe, expect, it } from "vitest";
import { haversineKm, parseLatLng, resolveLatLng } from "./geo.js";

describe("parseLatLng — tolera Google y Apple Maps", () => {
  const cases: Array<[string, string]> = [
    ["Google q=", "https://maps.google.com/?q=28.63,-106.07"],
    ["Google @", "https://www.google.com/maps/@28.635000,-106.070000,15z"],
    ["Google place !3d!4d", "https://www.google.com/maps/place/Casa/@28.63,-106.07,17z/data=!3d28.6301!4d-106.0702"],
    ["Apple ll=", "https://maps.apple.com/?ll=28.63,-106.07"],
    ["Apple daddr=", "https://maps.apple.com/?daddr=28.63,-106.07&dirflg=d"],
    ["Apple q+sll", "https://maps.apple.com/?q=Mi%20Casa&sll=28.63,-106.07"],
    ["geo:", "geo:28.63,-106.07"],
    ["crudo", "28.63, -106.07"],
    ["encoded %2C", "https://maps.apple.com/?ll=28.63%2C-106.07"],
  ];

  for (const [name, url] of cases) {
    it(`extrae de ${name}`, () => {
      const r = parseLatLng(url);
      expect(r).not.toBeNull();
      expect(r!.lat).toBeCloseTo(28.63, 1);
      expect(r!.lng).toBeCloseTo(-106.07, 1);
    });
  }

  it("devuelve null sin coordenadas", () => {
    expect(parseLatLng("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(parseLatLng("")).toBeNull();
    expect(parseLatLng(null)).toBeNull();
  });

  it("descarta coordenadas fuera de rango", () => {
    expect(parseLatLng("999.0,999.0")).toBeNull();
  });
});

describe("resolveLatLng — rutas sin red", () => {
  it("extrae directo de una URL larga (sin hacer fetch)", async () => {
    const r = await resolveLatLng("https://www.google.com/maps/@28.63,-106.07,15z");
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(28.63, 1);
    expect(r!.lng).toBeCloseTo(-106.07, 1);
  });
  it("extrae de coordenadas crudas", async () => {
    expect(await resolveLatLng("28.63,-106.07")).not.toBeNull();
  });
  it("null si no es URL ni coordenadas (no intenta red)", async () => {
    expect(await resolveLatLng("Calle Falsa 123, Chihuahua")).toBeNull();
    expect(await resolveLatLng(null)).toBeNull();
  });
  it("null en dominio que no es acortador conocido (no intenta red)", async () => {
    expect(await resolveLatLng("https://example.com/sin-coordenadas")).toBeNull();
  });
});

describe("haversineKm", () => {
  it("misma coordenada = 0", () => {
    expect(haversineKm({ lat: 28.63, lng: -106.07 }, { lat: 28.63, lng: -106.07 })).toBeCloseTo(0, 5);
  });
  it("distancia positiva y razonable", () => {
    const d = haversineKm({ lat: 28.63, lng: -106.07 }, { lat: 28.70, lng: -106.10 });
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(15);
  });
});
