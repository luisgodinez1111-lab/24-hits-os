import { describe, expect, it } from "vitest";
import { MOVEMENT_EFFECTS } from "./inventory.effects.js";

describe("MOVEMENT_EFFECTS", () => {
  it("cada efecto usa solo -1, 0 o 1 en cada bucket", () => {
    for (const [type, e] of Object.entries(MOVEMENT_EFFECTS)) {
      for (const [bucket, value] of Object.entries(e)) {
        expect([-1, 0, 1], `${type}.${bucket}`).toContain(value);
      }
    }
  });

  it("DAMAGE mueve de onHand a damaged (neto físico conservado)", () => {
    expect(MOVEMENT_EFFECTS.DAMAGE.onHand).toBe(-1);
    expect(MOVEMENT_EFFECTS.DAMAGE.damaged).toBe(+1);
  });

  it("TRANSFER_OUT reduce onHand (tránsito se deriva de los items de transferencia)", () => {
    expect(MOVEMENT_EFFECTS.TRANSFER_OUT.onHand).toBe(-1);
    expect(MOVEMENT_EFFECTS.TRANSFER_OUT.inTransitOutgoing).toBe(0);
    expect(MOVEMENT_EFFECTS.TRANSFER_IN.onHand).toBe(+1);
  });

  it("QUARANTINE_IN saca de onHand y suma a cuarentena", () => {
    expect(MOVEMENT_EFFECTS.QUARANTINE_IN.onHand).toBe(-1);
    expect(MOVEMENT_EFFECTS.QUARANTINE_IN.quarantine).toBe(+1);
  });

  it("reservas/asignaciones son neutrales al ledger físico", () => {
    for (const t of ["RESERVATION", "RESERVATION_RELEASE", "ALLOCATION", "ALLOCATION_RELEASE"] as const) {
      const e = MOVEMENT_EFFECTS[t];
      expect(e.onHand).toBe(0);
      expect(e.damaged).toBe(0);
      expect(e.quarantine).toBe(0);
    }
  });
});
