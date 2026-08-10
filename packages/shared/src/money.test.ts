import { describe, expect, it } from "vitest";
import { Money, MoneyError } from "./money.js";

describe("Money", () => {
  it("crea desde unidad mayor sin perder precisión", () => {
    const m = Money.fromMajor("123.45", "MXN");
    expect(m.amountMinor).toBe(12345n);
    expect(m.currency).toBe("MXN");
    expect(m.toMajorString()).toBe("123.45");
  });

  it("evita el clásico error de float 0.1 + 0.2", () => {
    const a = Money.fromMajor("0.10", "MXN");
    const b = Money.fromMajor("0.20", "MXN");
    expect(a.add(b).toMajorString()).toBe("0.30");
  });

  it("rechaza operar monedas distintas", () => {
    const mxn = Money.fromMajor("10.00", "MXN");
    const usd = Money.fromMajor("10.00", "USD");
    expect(() => mxn.add(usd)).toThrow(MoneyError);
  });

  it("multiplica por cantidad entera", () => {
    const price = Money.fromMajor("19.99", "MXN");
    expect(price.multiply(3).toMajorString()).toBe("59.97");
  });

  it("serializa a JSON con minor como string", () => {
    const m = Money.fromMinor(999999999999n, "MXN");
    expect(m.toJSON()).toEqual({ amountMinor: "999999999999", currency: "MXN" });
  });

  it("rechaza importes con demasiados decimales", () => {
    expect(() => Money.fromMajor("1.234", "MXN")).toThrow(MoneyError);
  });
});
