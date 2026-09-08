"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, FormField, Input, useToast } from "@24hits/ui";
import { api, ApiError } from "@/lib/api";

export type BulkReorderItem = { variantId: string; warehouseId: string };

// Carga masiva de puntos de reorden: aplica el mismo punto de reorden y stock objetivo
// a muchos productos de una vez (los seleccionados, o todos los filtrados). Hace usable
// el reabastecimiento en catálogos grandes, donde configurarlos de a uno es inviable.
export function BulkReorderPolicyDialog({
  open, onClose, onDone, items, scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  items: BulkReorderItem[];
  scopeLabel: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [reorderPoint, setReorderPoint] = useState("");
  const [targetStock, setTargetStock] = useState("");

  useEffect(() => {
    if (!open) return;
    setReorderPoint("");
    setTargetStock("");
  }, [open]);

  const rp = Number(reorderPoint);
  const ts = targetStock.trim() === "" ? null : Number(targetStock);
  const rpValid = reorderPoint.trim() !== "" && Number.isFinite(rp) && rp > 0;
  const tsInvalid = ts != null && (!Number.isFinite(ts) || ts <= 0);
  const orderInvalid = ts != null && ts < rp;
  const ready = rpValid && !tsInvalid && !orderInvalid && items.length > 0;

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ applied: number; skipped: number }>("/inventory/policies/bulk", {
        items,
        reorderPoint: rp,
        ...(ts != null ? { targetStock: ts } : {}),
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["inventory-balances"] });
      void qc.invalidateQueries({ queryKey: ["inventory-policies"] });
      void qc.invalidateQueries({ queryKey: ["reorder-suggestions"] });
      toast.push(
        `Punto de reorden aplicado a ${res.applied} producto(s)${res.skipped ? ` · ${res.skipped} omitido(s)` : ""} ✓`,
        "success"
      );
      onDone();
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "No se pudo aplicar la carga masiva", "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Punto de reorden en masa"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" loading={submit.isPending} disabled={!ready} onClick={() => submit.mutate()}>
            Aplicar a {items.length}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-brand/5 px-3 py-2 text-sm">
          Se aplicará a <b>{scopeLabel}</b>.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Punto de reorden">
            <Input type="number" inputMode="numeric" min="1" value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)} placeholder="Ej. 20" />
          </FormField>
          <FormField label="Stock objetivo (opcional)">
            <Input type="number" inputMode="numeric" min="1" value={targetStock}
              onChange={(e) => setTargetStock(e.target.value)} placeholder="por defecto ×2" />
          </FormField>
        </div>

        {orderInvalid && (
          <p className="text-xs text-red-600">El stock objetivo debe ser mayor o igual al punto de reorden.</p>
        )}

        <p className="text-[11px] text-gray-400">
          Cada producto se marcará para reorden cuando su disponible caiga a{" "}
          <b>{reorderPoint.trim() || "el punto de reorden"}</b> o menos, con compra sugerida hasta{" "}
          <b>{targetStock.trim() || (reorderPoint.trim() ? String(Number(reorderPoint) * 2) : "el doble")}</b> piezas.
          Sobrescribe el punto de reorden de los productos elegidos.
        </p>
      </div>
    </Dialog>
  );
}
