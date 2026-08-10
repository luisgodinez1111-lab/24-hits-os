import type { MovementType } from "@prisma/client";

// Efecto de un movimiento por unidad de cantidad sobre cada bucket del balance.
// Fuente ÚNICA de verdad (ADR-010/011): la usan el motor del API y el job de
// verificación de drift del worker. El tránsito NO se deriva de aquí, sino de los
// items de transferencia abiertos (ADR-017).
export interface BalanceEffect {
  onHand: number;
  damaged: number;
  quarantine: number;
  inTransitIncoming: number;
  inTransitOutgoing: number;
}

const Z: BalanceEffect = {
  onHand: 0,
  damaged: 0,
  quarantine: 0,
  inTransitIncoming: 0,
  inTransitOutgoing: 0,
};

export const MOVEMENT_EFFECTS: Record<MovementType, BalanceEffect> = {
  OPENING_BALANCE: { ...Z, onHand: +1 },
  MANUAL_IN: { ...Z, onHand: +1 },
  MANUAL_OUT: { ...Z, onHand: -1 },
  PURCHASE_RECEIPT: { ...Z, onHand: +1 },
  SALE: { ...Z, onHand: -1 },
  SALE_REVERSAL: { ...Z, onHand: +1 },
  CUSTOMER_RETURN: { ...Z, onHand: +1 },
  SUPPLIER_RETURN: { ...Z, onHand: -1 },
  TRANSFER_OUT: { ...Z, onHand: -1 },
  TRANSFER_IN: { ...Z, onHand: +1 },
  RESERVATION: Z,
  RESERVATION_RELEASE: Z,
  ALLOCATION: Z,
  ALLOCATION_RELEASE: Z,
  DAMAGE: { ...Z, onHand: -1, damaged: +1 },
  LOSS: { ...Z, onHand: -1 },
  THEFT: { ...Z, onHand: -1 },
  SAMPLE: { ...Z, onHand: -1 },
  WARRANTY_OUT: { ...Z, damaged: -1 },
  WARRANTY_IN: { ...Z, damaged: +1 },
  COUNT_ADJUSTMENT_IN: { ...Z, onHand: +1 },
  COUNT_ADJUSTMENT_OUT: { ...Z, onHand: -1 },
  INTERNAL_CONSUMPTION: { ...Z, onHand: -1 },
  QUARANTINE_IN: { ...Z, onHand: -1, quarantine: +1 },
  QUARANTINE_OUT: { ...Z, onHand: +1, quarantine: -1 },
};
