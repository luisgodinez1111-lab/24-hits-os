import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service.js";

// Prueba de hashing Argon2id (no requiere BD).
describe("PasswordService (Argon2id)", () => {
  const service = new PasswordService();

  it("hashea y verifica la contraseña correcta", async () => {
    const hash = await service.hash("Owner123!Dev");
    expect(hash).toMatch(/^\$argon2id\$/); // formato Argon2id
    expect(await service.verify(hash, "Owner123!Dev")).toBe(true);
  });

  it("rechaza una contraseña incorrecta", async () => {
    const hash = await service.hash("Owner123!Dev");
    expect(await service.verify(hash, "incorrecta")).toBe(false);
  });

  it("no lanza ante un hash inválido (devuelve false)", async () => {
    expect(await service.verify("no-es-un-hash", "x")).toBe(false);
  });
});
