"use client";

import { api, ApiError } from "./api";

// Cola de acciones offline para el reparto: cuando el repartidor cierra una entrega
// (marcar entregado + cobrar) SIN señal, la acción se guarda aquí y se sincroniza sola
// al reconectar. Seguridad financiera: ambas llamadas son IDEMPOTENTES —
//   · PATCH /orders/:id/delivery {DELIVERED}: no re-consume inventario si ya se entregó.
//   · POST /payments con `idempotencyKey` estable: no duplica el cobro al reintentar.
// Así, reintentar la misma acción N veces produce el mismo resultado que una.

const STORAGE_KEY = "hits:offline:deliveries";

export interface PendingDelivery {
  id: string; // uuid de la acción en cola
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  method: string; // CASH | CARD | TRANSFER | OTHER
  amount: number; // 0 = solo entregar, sin cobro
  idempotencyKey: string; // estable → cobro no duplicado
  createdAt: number;
  lastError?: string; // si el servidor rechazó definitivamente (no reintentable)
}

function read(): PendingDelivery[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingDelivery[]) : [];
  } catch {
    return [];
  }
}

function write(items: PendingDelivery[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    // Notifica a la UI (contador de pendientes) en la misma pestaña.
    window.dispatchEvent(new CustomEvent("hits:offline-queue-changed"));
  } catch {
    /* almacenamiento lleno/indisponible: se ignora */
  }
}

export function listPending(): PendingDelivery[] {
  return read();
}

export function enqueueDelivery(item: Omit<PendingDelivery, "id" | "createdAt">): void {
  const items = read();
  // Dedup por orderId: una entrega pendiente por pedido.
  const withoutDup = items.filter((i) => i.orderId !== item.orderId);
  withoutDup.push({ ...item, id: crypto.randomUUID(), createdAt: Date.now() });
  write(withoutDup);
}

// Ejecuta una acción encolada: entregar (idempotente) y luego cobrar (idempotente).
// Reintentable como unidad: si algo falla a mitad, la próxima corrida repite ambos
// pasos sin efectos duplicados.
async function runOne(item: PendingDelivery): Promise<void> {
  await api.patch(`/orders/${item.orderId}/delivery`, { status: "DELIVERED" });
  if (item.amount > 0) {
    await api.post("/payments", {
      orderId: item.orderId,
      method: item.method,
      amount: item.amount,
      idempotencyKey: item.idempotencyKey,
    });
  }
}

let syncing = false;

// Sincroniza la cola en orden (más viejo primero). Devuelve cuántas se completaron.
// - Error de red (sin señal): se detiene y deja el resto para el próximo intento.
// - Error del servidor (ApiError, p.ej. 409): la acción es inválida → se marca con
//   `lastError` y se saca del reintento automático (queda visible para el usuario).
export async function syncPending(): Promise<number> {
  if (syncing) return 0;
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  syncing = true;
  let done = 0;
  try {
    // Reprocesa siempre desde el almacenamiento (puede cambiar entre pasos).
    for (let queue = read().filter((i) => !i.lastError); queue.length > 0; queue = read().filter((i) => !i.lastError)) {
      const item = queue[0]!;
      try {
        await runOne(item);
        write(read().filter((i) => i.id !== item.id)); // completada → fuera
        done += 1;
      } catch (err) {
        if (err instanceof ApiError) {
          // El servidor respondió con un rechazo definitivo → no reintentar en bucle.
          write(read().map((i) => (i.id === item.id ? { ...i, lastError: err.message } : i)));
        }
        // Error de red o rechazo: cortar esta corrida (reintenta luego / queda marcada).
        break;
      }
    }
  } finally {
    syncing = false;
  }
  return done;
}
