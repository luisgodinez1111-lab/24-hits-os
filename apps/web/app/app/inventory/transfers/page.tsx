"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck } from "lucide-react";
import {
  Badge, Button, Dialog, EmptyState, FormField, Input, Select, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { Transfer, Variant } from "@/lib/catalog-types";
import type { Warehouse } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";

const statusTone: Record<string, "gray" | "amber" | "blue" | "green" | "red"> = {
  DRAFT: "gray", REQUESTED: "amber", APPROVED: "blue", IN_TRANSIT: "amber",
  PARTIALLY_RECEIVED: "amber", RECEIVED: "green", CANCELLED: "red",
};

export default function TransfersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["transfers"], queryFn: () => api.get<Transfer[]>("/transfers") });
  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => api.get<Warehouse[]>("/warehouses") });

  const whName = (id: string) => warehouses?.find((w) => w.id === id)?.name ?? id.slice(0, 8);
  const refresh = () => qc.invalidateQueries({ queryKey: ["transfers"] });

  const action = useMutation({
    mutationFn: ({ id, verb, body }: { id: string; verb: string; body?: unknown }) => api.post(`/transfers/${id}/${verb}`, body),
    onSuccess: async () => { await refresh(); toast.push("Actualizado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  function receiveAll(t: Transfer) {
    const items = t.items
      .map((i) => ({ itemId: i.id, quantity: Number(i.shippedQuantity) - Number(i.receivedQuantity) }))
      .filter((i) => i.quantity > 0);
    action.mutate({ id: t.id, verb: "receive", body: { items } });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transferencias</h1>
          <p className="text-sm text-gray-500">Movimiento entre almacenes con tránsito</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nueva</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Truck className="h-8 w-8 text-gray-400" />} title="Sin transferencias" />
      ) : (
        <Table>
          <THead><TR><TH>Origen → Destino</TH><TH className="text-right">Renglones</TH><TH>Estado</TH><TH className="text-right">Acciones</TH></TR></THead>
          <TBody>
            {data.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium">{whName(t.sourceWarehouseId)} → {whName(t.destinationWarehouseId)}</TD>
                <TD className="text-right">{t.items.length}</TD>
                <TD><Badge tone={statusTone[t.status] ?? "gray"}>{t.status}</Badge></TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    {t.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => action.mutate({ id: t.id, verb: "request" })}>Solicitar</Button>}
                    {t.status === "REQUESTED" && <Button size="sm" variant="outline" onClick={() => action.mutate({ id: t.id, verb: "approve" })}>Aprobar</Button>}
                    {t.status === "APPROVED" && <Button size="sm" onClick={() => action.mutate({ id: t.id, verb: "ship", body: {} })}>Enviar</Button>}
                    {(t.status === "IN_TRANSIT" || t.status === "PARTIALLY_RECEIVED") && <Button size="sm" onClick={() => receiveAll(t)}>Recibir</Button>}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CreateTransferDialog open={creating} onClose={() => setCreating(false)} warehouses={warehouses ?? []}
        onCreated={async () => { setCreating(false); await refresh(); toast.push("Transferencia creada", "success"); }} />
    </div>
  );
}

function CreateTransferDialog({ open, onClose, warehouses, onCreated }: {
  open: boolean; onClose: () => void; warehouses: Warehouse[]; onCreated: () => void;
}) {
  const toast = useToast();
  const { data: variants } = useQuery({ queryKey: ["variants"], queryFn: () => api.get<Variant[]>("/variants"), enabled: open });
  const [source, setSource] = useState("");
  const [dest, setDest] = useState("");
  const [rows, setRows] = useState<Array<{ variantId: string; qty: string }>>([{ variantId: "", qty: "" }]);

  const create = useMutation({
    mutationFn: () => api.post("/transfers", {
      sourceWarehouseId: source, destinationWarehouseId: dest,
      items: rows.filter((r) => r.variantId && Number(r.qty) > 0).map((r) => ({ variantId: r.variantId, requestedQuantity: Number(r.qty) })),
    }),
    onSuccess: () => { setRows([{ variantId: "", qty: "" }]); setSource(""); setDest(""); onCreated(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Nueva transferencia"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={create.isPending} onClick={() => {
          if (!source || !dest || source === dest) return toast.push("Selecciona origen y destino distintos", "error");
          if (!rows.some((r) => r.variantId && Number(r.qty) > 0)) return toast.push("Agrega al menos un renglón", "error");
          create.mutate();
        }}>Crear</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Origen">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Destino">
            <Select value={dest} onChange={(e) => setDest(e.target.value)}>
              <option value="">…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </FormField>
        </div>
        {rows.map((r, idx) => (
          <div key={idx} className="grid grid-cols-2 gap-2">
            <Select value={r.variantId} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, variantId: e.target.value } : x))}>
              <option value="">Variante…</option>
              {variants?.map((v) => <option key={v.id} value={v.id}>{v.sku} · {v.name}</option>)}
            </Select>
            <Input type="number" placeholder="Cantidad" value={r.qty}
              onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))} />
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { variantId: "", qty: "" }])}>+ Renglón</Button>
      </div>
    </Dialog>
  );
}
