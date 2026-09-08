"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, FormField, Input, useToast } from "@24hits/ui";
import { api, ApiError } from "@/lib/api";

export type ReorderPolicyTarget = {
  variantId: string;
  warehouseId: string;
  label: string;
  warehouseName: string;
  reorderPoint: number | null;
  targetStock: number | null;
};

// Configura el punto de reorden y el stock objetivo de un producto en un almacén.
// Es lo que enciende el estado "Reorden" de Existencias y las sugerencias de compra:
// cuando el disponible cae al punto de reorden, sugiere comprar hasta el stock objetivo.
export function ReorderPolicyDialog({
  open, onClose, onDone, target,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  target: ReorderPolicyTarget | null;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [reorderPoint, setReorderPoint] = useState("");
  const [targetStock, setTargetStock] = useState("");

  // Al abrir: precarga los valores actuales de la política (si ya existe).
  useEffect(() => {
    if (!open || !target) return;
    setReorderPoint(target.reorderPoint != null ? String(target.reorderPoint) : "");
    setTargetStock(target.targetStock != null ? String(target.targetStock) : "");
  }, [open, target]);

  const rp = reorderPoint.trim() === "" ? null : Number(reorderPoint);
  const ts = targetStock.trim() === "" ? null : Number(targetStock);
  const rpInvalid = rp != null && (!Number.isFinite(rp) || rp < 0);
  const tsInvalid = ts != null && (!Number.isFinite(ts) || ts < 0);
  const orderInvalid = rp != null && ts != null && ts < rp;
  const ready = !rpInvalid && !tsInvalid && !orderInvalid;

  const submit = useMutation({
    mutationFn: async () => {
      if (!target) return;
      await api.post("/inventory/policies", {
        warehouseId: target.warehouseId,
        variantId: target.variantId,
        reorderPoint: rp,
        targetStock: ts,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inventory-balances"] });
      void qc.invalidateQueries({ queryKey: ["inventory-policies"] });
      void qc.invalidateQueries({ queryKey: ["reorder-suggestions"] });
      toast.push("Punto de reorden guardado ✓", "success");
      onDone();
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "No se pudo guardar el punto de reorden", "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Punto de reorden"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" loading={submit.isPending} disabled={!ready} onClick={() => submit.mutate()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {target && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <p className="font-medium">{target.label}</p>
            <p className="text-xs text-gray-500">{target.warehouseName}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Punto de reorden">
            <Input type="number" inputMode="numeric" min="0" value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)} placeholder="Ej. 20" />
          </FormField>
          <FormField label="Stock objetivo">
            <Input type="number" inputMode="numeric" min="0" value={targetStock}
              onChange={(e) => setTargetStock(e.target.value)} placeholder="Ej. 50" />
          </FormField>
        </div>

        {orderInvalid && (
          <p className="text-xs text-red-600">El stock objetivo debe ser mayor o igual al punto de reorden.</p>
        )}

        <p className="text-[11px] text-gray-400">
          Cuando el disponible caiga a <b>{reorderPoint.trim() || "el punto de reorden"}</b> o menos, el producto
          aparecerá en <b>Reabastecer</b> con una compra sugerida hasta <b>{targetStock.trim() || "el stock objetivo"}</b> piezas.
          Deja ambos vacíos para quitar el punto de reorden.
        </p>
      </div>
    </Dialog>
  );
}
