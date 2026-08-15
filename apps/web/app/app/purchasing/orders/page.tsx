"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShoppingCart } from "lucide-react";
import {
  Badge, Button, Combobox, Dialog, EmptyState, FormField, Input, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { PurchaseOrder, Supplier, Variant } from "@/lib/catalog-types";
import type { Warehouse } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";

const tone: Record<string, "gray" | "amber" | "blue" | "green" | "red"> = {
  DRAFT: "gray", SUBMITTED: "amber", APPROVED: "blue", ORDERED: "blue",
  PARTIALLY_RECEIVED: "amber", RECEIVED: "green", CANCELLED: "red", CLOSED: "gray",
};

export default function PurchaseOrdersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["purchase-orders"], queryFn: () => api.get<PurchaseOrder[]>("/purchase-orders") });
  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: () => api.get<Supplier[]>("/suppliers") });

  const supplierName = (id: string) => suppliers?.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const refresh = () => qc.invalidateQueries({ queryKey: ["purchase-orders"] });

  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: string }) => api.post(`/purchase-orders/${id}/${verb}`),
    onSuccess: async () => { await refresh(); toast.push("Actualizado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  // Recibir todo lo pendiente: crea una recepción contra la PO y la postea.
  const receive = useMutation({
    mutationFn: async (po: PurchaseOrder) => {
      const items = po.items
        .filter((i) => Number(i.orderedQuantity) - Number(i.receivedQuantity) > 0)
        .map((i) => ({
          variantId: i.variantId,
          quantity: Number(i.orderedQuantity) - Number(i.receivedQuantity),
          unitCost: Number(i.unitCost),
          purchaseOrderItemId: i.id,
        }));
      const receipt = await api.post<{ id: string }>("/purchase-receipts", {
        supplierId: po.supplierId, warehouseId: po.warehouseId, purchaseOrderId: po.id, items,
      });
      await api.post(`/purchase-receipts/${receipt.id}/post`);
    },
    onSuccess: async () => { await refresh(); toast.push("Mercancía recibida (inventario + costo actualizados)", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Órdenes de compra</h1>
          <p className="text-sm text-gray-500">La recepción alimenta inventario y costo promedio</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nueva</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<ShoppingCart className="h-8 w-8 text-gray-400" />} title="Sin órdenes de compra" />
      ) : (
        <Table>
          <THead><TR><TH>Folio</TH><TH>Proveedor</TH><TH className="text-right">Total</TH><TH>Estado</TH><TH className="text-right">Acciones</TH></TR></THead>
          <TBody>
            {data.map((po) => (
              <TR key={po.id}>
                <TD className="font-mono text-xs">{po.number}</TD>
                <TD className="font-medium">{supplierName(po.supplierId)}</TD>
                <TD className="text-right">${Number(po.total).toFixed(2)}</TD>
                <TD><Badge tone={tone[po.status] ?? "gray"}>{po.status}</Badge></TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    {po.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => action.mutate({ id: po.id, verb: "submit" })}>Enviar</Button>}
                    {po.status === "SUBMITTED" && <Button size="sm" variant="outline" onClick={() => action.mutate({ id: po.id, verb: "approve" })}>Aprobar</Button>}
                    {po.status === "APPROVED" && <Button size="sm" variant="outline" onClick={() => action.mutate({ id: po.id, verb: "order" })}>Ordenar</Button>}
                    {(po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED") && <Button size="sm" loading={receive.isPending} onClick={() => receive.mutate(po)}>Recibir</Button>}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CreatePODialog open={creating} onClose={() => setCreating(false)} suppliers={suppliers ?? []}
        onCreated={async () => { setCreating(false); await refresh(); toast.push("Orden creada", "success"); }} />
    </div>
  );
}

function CreatePODialog({ open, onClose, suppliers, onCreated }: {
  open: boolean; onClose: () => void; suppliers: Supplier[]; onCreated: () => void;
}) {
  const toast = useToast();
  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => api.get<Warehouse[]>("/warehouses"), enabled: open });
  const { data: variants } = useQuery({ queryKey: ["variants"], queryFn: () => api.get<Variant[]>("/variants"), enabled: open });
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [rows, setRows] = useState<Array<{ variantId: string; qty: string; cost: string }>>([{ variantId: "", qty: "", cost: "" }]);

  const create = useMutation({
    mutationFn: () => api.post("/purchase-orders", {
      supplierId, warehouseId,
      items: rows.filter((r) => r.variantId && Number(r.qty) > 0).map((r) => ({ variantId: r.variantId, orderedQuantity: Number(r.qty), unitCost: Number(r.cost || 0) })),
    }),
    onSuccess: () => { setRows([{ variantId: "", qty: "", cost: "" }]); setSupplierId(""); setWarehouseId(""); onCreated(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Nueva orden de compra"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={create.isPending} onClick={() => {
          if (!supplierId || !warehouseId) return toast.push("Selecciona proveedor y almacén", "error");
          if (!rows.some((r) => r.variantId && Number(r.qty) > 0)) return toast.push("Agrega al menos un renglón", "error");
          create.mutate();
        }}>Crear</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Proveedor">
            <Combobox value={supplierId} onChange={setSupplierId} placeholder="Proveedor…"
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          </FormField>
          <FormField label="Almacén destino">
            <Combobox value={warehouseId} onChange={setWarehouseId} placeholder="Almacén…"
              options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))} />
          </FormField>
        </div>
        {rows.map((r, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-2">
            <Combobox value={r.variantId} placeholder="Variante…"
              onChange={(v) => setRows(rows.map((x, i) => (i === idx ? { ...x, variantId: v } : x)))}
              options={(variants ?? []).map((v) => ({ value: v.id, label: `${v.sku} · ${v.name}` }))} />
            <Input type="number" placeholder="Cantidad" value={r.qty} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))} />
            <Input type="number" placeholder="Costo unit." value={r.cost} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, cost: e.target.value } : x))} />
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { variantId: "", qty: "", cost: "" }])}>+ Renglón</Button>
      </div>
    </Dialog>
  );
}
