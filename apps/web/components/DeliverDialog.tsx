"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ScanLine } from "lucide-react";
import { Button, Dialog, FormField, Input, Select, Skeleton, useToast } from "@24hits/ui";
import type { Order } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { enqueueDelivery } from "@/lib/offline-queue";
import { money } from "@/lib/format";
import { BarcodeScanner } from "./BarcodeScanner";

// Geo-sello de la entrega: dónde está el repartidor al cerrar. maximumAge alto porque
// la Ruta ya vigila el GPS (suele haber un fix reciente → responde al instante). Si el
// dispositivo no da ubicación, la entrega NO se bloquea (la prueba queda sin coords).
function captureGeo(): Promise<{ lat: number; lng: number; acc: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: typeof p.coords.accuracy === "number" ? p.coords.accuracy : 0 }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 15000 }
    );
  });
}

// Entrega en la puerta: escanea los productos para CONFIRMAR que es el pedido
// correcto, cobra y marca entregado (consume inventario). Cierra el ciclo del
// reparto de un tiro. Para productos sin código: "saltar verificación".
export function DeliverDialog({ stopId, onClose, onDone }: { stopId: string | null; onClose: () => void; onDone: () => void }) {
  const open = !!stopId;
  const toast = useToast();

  const { data: order, isLoading } = useQuery({
    queryKey: ["order-detail", stopId],
    enabled: open,
    queryFn: () => api.get<Order>(`/orders/${stopId}`),
  });

  // Cantidades requeridas por variante.
  const needed = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of order?.items ?? []) m.set(it.variantId, (m.get(it.variantId) ?? 0) + Number(it.quantity));
    return m;
  }, [order]);
  const totalNeeded = [...needed.values()].reduce((a, b) => a + b, 0);

  // Lo que se entrega, por renglón: modelo · sabor · cantidad. Es lo primero que
  // ve el repartidor al abrir la entrega (antes de escanear), para saber qué lleva.
  const lines = useMemo(() => {
    const m = new Map<string, { label: string; need: number }>();
    for (const it of order?.items ?? []) {
      const model = it.productName?.trim() || null;
      const flavor = it.flavorName?.trim() || null;
      const variant = it.variantName?.trim() || null;
      const label = model && flavor ? `${model} · ${flavor}`
        : model && variant ? `${model} · ${variant}`
        : variant || model || it.sku || "Producto";
      const prev = m.get(it.variantId);
      m.set(it.variantId, { label, need: (prev?.need ?? 0) + Number(it.quantity) });
    }
    return [...m.entries()].map(([variantId, v]) => ({ variantId, ...v }));
  }, [order]);

  const [verified, setVerified] = useState<Map<string, { name: string; count: number }>>(new Map());
  const [override, setOverride] = useState(false);
  const [method, setMethod] = useState("CASH");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState(""); // ¿quién recibió? (opcional)

  // Reinicia al abrir un pedido nuevo; monto por defecto = total del pedido.
  useEffect(() => {
    if (open) {
      setVerified(new Map());
      setOverride(false);
      setMethod("CASH");
      setAmount(order?.total ?? "");
      setRecipient("");
    }
  }, [open, order?.id, order?.total]);

  const totalVerified = [...verified.values()].reduce((a, v) => a + v.count, 0);
  const ready = override || (totalNeeded > 0 && totalVerified >= totalNeeded);

  async function onScan(code: string) {
    try {
      const v = await api.get<{ variantId: string; name: string }>(`/pos/lookup?barcode=${encodeURIComponent(code)}`);
      const need = needed.get(v.variantId);
      if (need == null) { toast.push("Ese producto no es de este pedido", "error"); return; }
      const cur = verified.get(v.variantId)?.count ?? 0;
      if (cur >= need) { toast.push("Ya verificaste todas las piezas de ese producto", "error"); return; }
      setVerified((prev) => { const m = new Map(prev); m.set(v.variantId, { name: v.name, count: cur + 1 }); return m; });
      toast.push(`✓ ${v.name}`, "success");
    } catch {
      toast.push("Código no reconocido", "error");
    }
  }

  const finish = useMutation({
    mutationFn: async (): Promise<{ queued: boolean }> => {
      if (!stopId) return { queued: false };
      const amt = Number(amount || 0);
      // Clave estable de idempotencia por pedido → reintentar NUNCA duplica el cobro.
      const idempotencyKey = `pay:${stopId}`;
      // Prueba de entrega: dónde está el repartidor al cerrar + quién recibió.
      const geo = await captureGeo();
      const recip = recipient.trim() || undefined;
      const proof = {
        ...(geo ? { deliveredLat: geo.lat, deliveredLng: geo.lng, deliveredAccuracy: Math.round(geo.acc) } : {}),
        ...(recip ? { deliveryRecipient: recip } : {}),
      };
      // Payload para la cola offline (lleva la prueba para sellarla al sincronizar).
      const queueItem = {
        orderId: stopId, orderNumber: order?.number, method, amount: amt, idempotencyKey,
        deliveredLat: geo?.lat, deliveredLng: geo?.lng, deliveredAccuracy: geo ? Math.round(geo.acc) : undefined, recipient: recip,
      };

      // Sin señal: encola (entregar + cobrar) y sincroniza sola al reconectar, en vez
      // de fallar la entrega. La entrega no se pierde aunque el repartidor esté offline.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueueDelivery(queueItem);
        return { queued: true };
      }

      try {
        // 1) Entregar (auto-confirma + fulfill → consume inventario, sella la prueba). 2) Cobrar.
        await api.patch(`/orders/${stopId}/delivery`, { status: "DELIVERED", ...proof });
        if (amt > 0) await api.post("/payments", { orderId: stopId, method, amount: amt, idempotencyKey });
        return { queued: false };
      } catch (err) {
        // Error del SERVIDOR (ApiError): rechazo real → propaga y se muestra.
        if (err instanceof ApiError) throw err;
        // Falla de RED a mitad (se cayó la señal): encola para sincronizar luego.
        enqueueDelivery(queueItem);
        return { queued: true };
      }
    },
    onSuccess: (r) => {
      toast.push(
        r.queued ? "Sin señal: entrega guardada, se sincroniza al reconectar" : "Entregado y cobrado ✓",
        r.queued ? "info" : "success"
      );
      onDone();
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al cerrar la entrega", "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Entregar ${order?.number ?? ""}`}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" loading={finish.isPending} disabled={!ready} onClick={() => finish.mutate()} data-testid="deliver-confirm-btn">
            <Check className="h-4 w-4" /> Cobrar y entregar
          </Button>
        </>
      }
    >
      {isLoading || !order ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span className="flex items-center gap-2 font-medium"><ScanLine className="h-4 w-4" /> Verificados</span>
            <span className="font-semibold tabular-nums">{totalVerified} / {totalNeeded}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100">
            <div className="h-1.5 rounded-full bg-brand transition-all" style={{ width: `${totalNeeded > 0 ? Math.min(100, (totalVerified / totalNeeded) * 100) : 0}%` }} />
          </div>

          {/* Lo que debe entregar: modelo · sabor · cantidad, visible al abrir. */}
          {lines.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Lo que entregas</p>
              <ul className="space-y-1 text-sm">
                {lines.map((l) => {
                  const done = verified.get(l.variantId)?.count ?? 0;
                  const complete = done >= l.need;
                  return (
                    <li key={l.variantId} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${complete ? "bg-green-50 text-green-800" : "bg-gray-50 text-gray-700"}`}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 font-bold tabular-nums">{l.need}×</span>
                        <span className="truncate">{l.label}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {complete ? <Check className="h-4 w-4" /> : `${done}/${l.need}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!ready && <BarcodeScanner continuous onScan={(c) => void onScan(c)} />}

          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" data-testid="deliver-skip-verify" className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            Saltar verificación (productos sin código)
          </label>

          <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
            <FormField label="Cobro">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="CASH">Efectivo</option>
                <option value="CARD">Tarjeta</option>
                <option value="TRANSFER">Transferencia</option>
                <option value="OTHER">Otro</option>
              </Select>
            </FormField>
            <FormField label="Monto">
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </FormField>
          </div>
          {/* Prueba de entrega: quién recibió (opcional). La ubicación/hora se sellan solas. */}
          <FormField label="¿Quién recibió? (opcional)">
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Nombre de quien recibió" maxLength={120} />
          </FormField>
          <p className="text-[11px] text-gray-400">Total del pedido: {money(order.total)}. Deja el monto en 0 si ya está pagado. Al entregar se sella hora y ubicación como prueba.</p>
        </div>
      )}
    </Dialog>
  );
}
