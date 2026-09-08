"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Combobox, Dialog, FormField, useToast } from "@24hits/ui";
import { api, ApiError } from "@/lib/api";

type SupplierLite = { id: string; name: string };

// Asignación masiva de proveedor preferido: marca a un proveedor como referencia
// de muchos productos de una vez. Cierra el círculo de reabastecimiento — una
// sugerencia solo puede convertirse en orden de compra si el producto tiene
// proveedor, y asignarlo de a uno no escala.
export function BulkAssignSupplierDialog({
  open, onClose, onDone, variantIds, scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  variantIds: string[];
  scopeLabel: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState("");

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    enabled: open,
    queryFn: () => api.get<SupplierLite[]>("/suppliers"),
  });

  useEffect(() => {
    if (open) setSupplierId("");
  }, [open]);

  const options = useMemo(() => (suppliers ?? []).map((s) => ({ value: s.id, label: s.name })), [suppliers]);
  const noSuppliers = suppliers != null && suppliers.length === 0;
  const ready = !!supplierId && variantIds.length > 0;

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ applied: number; skipped: number }>(`/suppliers/${supplierId}/references/bulk`, {
        variantIds,
        isPreferred: true,
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["reorder-suggestions"] });
      toast.push(
        `Proveedor asignado a ${res.applied} producto(s)${res.skipped ? ` · ${res.skipped} omitido(s)` : ""} ✓`,
        "success"
      );
      onDone();
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "No se pudo asignar el proveedor", "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Asignar proveedor en masa"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" loading={submit.isPending} disabled={!ready} onClick={() => submit.mutate()}>
            Asignar a {variantIds.length}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-brand/5 px-3 py-2 text-sm">
          Se asignará como proveedor preferido de <b>{scopeLabel}</b>.
        </div>

        {noSuppliers ? (
          <p className="text-sm text-gray-500">
            No hay proveedores todavía. Crea uno en <b>Compras → Proveedores</b> y vuelve aquí.
          </p>
        ) : (
          <FormField label="Proveedor">
            <Combobox value={supplierId} onChange={setSupplierId} options={options} placeholder="Elige un proveedor…" />
          </FormField>
        )}

        <p className="text-[11px] text-gray-400">
          Cada producto quedará con este proveedor como <b>preferido</b> (se desmarca cualquier otro
          preferido de esos productos). Es el proveedor que usará <b>Reabastecer</b> para agrupar la
          compra sugerida y crear la orden.
        </p>
      </div>
    </Dialog>
  );
}
