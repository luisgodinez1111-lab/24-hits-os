"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ScanLine } from "lucide-react";
import { Button, Dialog, FormField, Input, Select, Skeleton, useToast } from "@24hits/ui";
import type { Order } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { BarcodeScanner } from "./BarcodeScanner";

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

  const [verified, setVerified] = useState<Map<string, { name: string; count: number }>>(new Map());
  const [override, setOverride] = useState(false);
  const [method, setMethod] = useState("CASH");
  const [amount, setAmount] = useState("");

  // Reinicia al abrir un pedido nuevo; monto por defecto = total del pedido.
  useEffect(() => {
    if (open) {
      setVerified(new Map());
      setOverride(false);
      setMethod("CASH");
      setAmount(order?.total ?? "");
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
    mutationFn: async () => {
      // 1) Entregar (auto-confirma + fulfill → consume inventario). 2) Cobrar.
      await api.patch(`/orders/${stopId}/delivery`, { status: "DELIVERED" });
      const amt = Number(amount || 0);
      if (amt > 0) await api.post("/payments", { orderId: stopId, method, amount: amt });
    },
    onSuccess: () => { toast.push("Entregado y cobrado ✓", "success"); onDone(); },
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
          <Button size="sm" loading={finish.isPending} disabled={!ready} onClick={() => finish.mutate()}>
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

          {!ready && <BarcodeScanner continuous onScan={(c) => void onScan(c)} />}

          {verified.size > 0 && (
            <ul className="space-y-1 text-sm">
              {[...verified.entries()].map(([id, v]) => (
                <li key={id} className="flex items-center justify-between rounded-md bg-green-50 px-2 py-1 text-green-800">
                  <span className="truncate pr-2">{v.name}</span>
                  <span className="shrink-0 font-semibold">×{v.count}</span>
                </li>
              ))}
            </ul>
          )}

          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" checked={override} onChange={(e) => setOverride(e.target.checked)} />
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
          <p className="text-[11px] text-gray-400">Total del pedido: {money(order.total)}. Deja el monto en 0 si ya está pagado.</p>
        </div>
      )}
    </Dialog>
  );
}
