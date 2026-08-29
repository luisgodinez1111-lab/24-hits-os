"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, PackagePlus, Plus } from "lucide-react";
import { Button, Combobox, Dialog, FormField, Input, Select, useToast } from "@24hits/ui";
import type { Variant } from "@/lib/catalog-types";
import type { Warehouse } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";

type Mode = "load" | "adjust";

// Motivos de ajuste (enum del backend) con etiqueta en español.
const REASONS: Array<{ value: string; label: string }> = [
  { value: "DATA_CORRECTION", label: "Corrección de datos" },
  { value: "COUNT_DIFFERENCE", label: "Diferencia de conteo" },
  { value: "LOSS", label: "Pérdida / merma" },
  { value: "THEFT", label: "Robo" },
  { value: "DAMAGE", label: "Producto dañado" },
  { value: "OTHER", label: "Otro" },
];

// Etiqueta modelo · sabor de una variante.
function variantLabel(v: Variant): string {
  const model = v.product?.name?.trim() || null;
  const flavor = v.flavor?.name?.trim() || null;
  if (model && flavor) return `${model} · ${flavor}`;
  if (model) return `${model} · ${v.name}`;
  return `${v.sku} · ${v.name}`;
}

// Carga (saldo inicial) y ajuste (+/−) de existencias desde la interfaz.
// - "Cargar" usa opening-balance: fija piezas iniciales (+ costo opcional).
// - "Ajustar" usa manual-adjustments: suma o resta con motivo. Cantidades
//   grandes pueden requerir aprobación de otra persona (lo indica el backend).
export function StockAdjustDialog({
  open, onClose, onDone, warehouses, prefill,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  warehouses: Warehouse[];
  prefill?: { variantId?: string; warehouseId?: string } | null;
}) {
  const toast = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("load");
  const [variantId, setVariantId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [reasonCode, setReasonCode] = useState("DATA_CORRECTION");
  const [reasonText, setReasonText] = useState("");

  const { data: variants } = useQuery({
    queryKey: ["variants"],
    enabled: open,
    queryFn: () => api.get<Variant[]>("/variants"),
  });

  // Al abrir: reinicia y aplica prefill (variante/almacén de la fila elegida).
  useEffect(() => {
    if (!open) return;
    setMode(prefill?.variantId ? "adjust" : "load");
    setVariantId(prefill?.variantId ?? "");
    setWarehouseId(prefill?.warehouseId ?? (warehouses.length === 1 ? warehouses[0]?.id ?? "" : ""));
    setQuantity("");
    setUnitCost("");
    setDirection("IN");
    setReasonCode("DATA_CORRECTION");
    setReasonText("");
  }, [open]);

  const variantOptions = useMemo(
    () => (variants ?? []).map((v) => ({ value: v.id, label: variantLabel(v) })),
    [variants]
  );

  const qtyNum = Number(quantity);
  const ready =
    !!variantId &&
    !!warehouseId &&
    qtyNum > 0 &&
    (mode === "load" || reasonText.trim().length > 0);

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === "load") {
        await api.post("/inventory/opening-balance", {
          warehouseId,
          variantId,
          quantity: qtyNum,
          ...(unitCost.trim() ? { unitCost: Number(unitCost) } : {}),
        });
        return { requiresApproval: false as boolean };
      }
      const res = await api.post<{ requiresApproval: boolean }>("/inventory/manual-adjustments", {
        warehouseId,
        variantId,
        quantity: qtyNum,
        direction,
        reasonCode,
        reasonText: reasonText.trim(),
      });
      return res;
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["inventory-balances"] });
      if (mode === "adjust" && res?.requiresApproval) {
        toast.push("Ajuste enviado: requiere aprobación de otra persona", "success");
      } else {
        toast.push(mode === "load" ? "Stock cargado ✓" : "Stock ajustado ✓", "success");
      }
      onDone();
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "No se pudo guardar", "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cargar / ajustar stock"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" loading={submit.isPending} disabled={!ready} onClick={() => submit.mutate()}>
            {mode === "load" ? "Cargar stock" : "Guardar ajuste"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Modo. */}
        <div className="inline-flex w-full rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => setMode("load")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${mode === "load" ? "bg-brand text-white" : "text-gray-600"}`}
          >
            <PackagePlus className="h-4 w-4" /> Cargar
          </button>
          <button
            onClick={() => setMode("adjust")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${mode === "adjust" ? "bg-brand text-white" : "text-gray-600"}`}
          >
            <Plus className="h-3.5 w-3.5" /><Minus className="h-3.5 w-3.5 -ml-1" /> Ajustar
          </button>
        </div>

        <FormField label="Producto (modelo · sabor)">
          <Combobox value={variantId} onChange={setVariantId} options={variantOptions} placeholder="Busca modelo, sabor o SKU…" />
        </FormField>

        <FormField label="Almacén">
          <Combobox
            value={warehouseId}
            onChange={setWarehouseId}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            placeholder="Elige bodega…"
          />
        </FormField>

        {mode === "adjust" && (
          <FormField label="Movimiento">
            <div className="inline-flex w-full rounded-lg border border-gray-200 p-0.5">
              <button
                onClick={() => setDirection("IN")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${direction === "IN" ? "bg-green-600 text-white" : "text-gray-600"}`}
              >
                <Plus className="h-4 w-4" /> Entra (sumar)
              </button>
              <button
                onClick={() => setDirection("OUT")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${direction === "OUT" ? "bg-red-600 text-white" : "text-gray-600"}`}
              >
                <Minus className="h-4 w-4" /> Sale (restar)
              </button>
            </div>
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Cantidad (piezas)">
            <Input type="number" inputMode="numeric" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
          </FormField>
          {mode === "load" && (
            <FormField label="Costo unitario (opcional)">
              <Input type="number" inputMode="decimal" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
            </FormField>
          )}
        </div>

        {mode === "adjust" && (
          <>
            <FormField label="Motivo">
              <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Detalle del motivo">
              <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Ej. conteo físico: sobraban 3 piezas" />
            </FormField>
          </>
        )}

        <p className="text-[11px] text-gray-400">
          {mode === "load"
            ? "Cargar fija las piezas iniciales de ese producto en la bodega (saldo inicial). Para reponer mercancía recurrente usa Ajustar → Entra, o registra una compra."
            : "El ajuste suma o resta al stock con un motivo trazable. Cantidades grandes pueden requerir aprobación de otra persona."}
        </p>
      </div>
    </Dialog>
  );
}
