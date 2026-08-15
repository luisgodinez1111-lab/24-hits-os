"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, CreditCard, Plus, Receipt } from "lucide-react";
import {
  Badge, Button, Dialog, EmptyState, FormField, Input, Select, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { Customer, Order, Variant } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/me";

const tone: Record<string, "gray" | "amber" | "blue" | "green" | "red"> = {
  DRAFT: "gray", CONFIRMED: "blue", PARTIALLY_FULFILLED: "amber",
  FULFILLED: "green", COMPLETED: "green", CANCELLED: "red",
};
const payTone: Record<string, "gray" | "amber" | "green"> = {
  PENDING: "gray", PARTIAL: "amber", PAID: "green",
};
const deliveryTone: Record<string, "gray" | "amber" | "green"> = { PENDING: "gray", DISPATCHED: "amber", DELIVERED: "green" };
const deliveryLabel: Record<string, string> = { PENDING: "Por enviar", DISPATCHED: "Enviado", DELIVERED: "Entregado" };

export default function SalesOrdersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["sales-orders"], queryFn: () => api.get<Order[]>("/orders") });
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => api.get<Customer[]>("/customers") });

  const customerName = (id: string | null) => (id ? customers?.find((c) => c.id === id)?.name ?? id.slice(0, 8) : "Mostrador");
  const refresh = () => qc.invalidateQueries({ queryKey: ["sales-orders"] });

  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: string }) => api.post(`/orders/${id}/${verb}`),
    onSuccess: async () => { await refresh(); toast.push("Pedido actualizado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  const issueNote = useMutation({
    mutationFn: (orderId: string) => api.post("/sale-notes", { orderId }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["sale-notes"] }); toast.push("Nota de venta emitida", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  const delivery = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/orders/${id}/delivery`, { status }),
    onSuccess: async () => { await refresh(); toast.push("Entrega actualizada", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pedidos</h1>
          <p className="text-sm text-gray-500">Confirmar reserva stock · entregar consume inventario y captura COGS</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="h-8 w-8 text-gray-400" />} title="Sin pedidos" />
      ) : (
        <Table>
          <THead><TR><TH>Folio</TH><TH>Cliente</TH><TH className="text-right">Total</TH><TH>Estado</TH><TH>Pago</TH><TH>Entrega</TH><TH className="text-right">Acciones</TH></TR></THead>
          <TBody>
            {data.map((o) => (
              <TR key={o.id}>
                <TD className="font-mono text-xs">{o.number}</TD>
                <TD className="font-medium">{customerName(o.customerId)}</TD>
                <TD className="text-right">${Number(o.total).toFixed(2)}</TD>
                <TD><Badge tone={tone[o.status] ?? "gray"}>{o.status}</Badge></TD>
                <TD><Badge tone={payTone[o.paymentStatus] ?? "gray"}>{o.paymentStatus}</Badge></TD>
                <TD>
                  {o.deliveryStatus ? (
                    <div className="flex items-center gap-2">
                      <Badge tone={deliveryTone[o.deliveryStatus] ?? "gray"}>{deliveryLabel[o.deliveryStatus] ?? o.deliveryStatus}</Badge>
                      {o.deliveryStatus === "PENDING" && <Button size="sm" variant="ghost" loading={delivery.isPending} onClick={() => delivery.mutate({ id: o.id, status: "DISPATCHED" })}>Enviar</Button>}
                      {o.deliveryStatus === "DISPATCHED" && <Button size="sm" variant="ghost" loading={delivery.isPending} onClick={() => delivery.mutate({ id: o.id, status: "DELIVERED" })}>Entregado</Button>}
                      {o.deliveryLocationUrl && <a href={o.deliveryLocationUrl} target="_blank" rel="noreferrer" className="text-xs text-brand underline">ubicación</a>}
                    </div>
                  ) : <span className="text-gray-300">—</span>}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    {o.status === "DRAFT" && <Button size="sm" variant="outline" loading={action.isPending} onClick={() => action.mutate({ id: o.id, verb: "confirm" })}>Confirmar</Button>}
                    {(o.status === "CONFIRMED" || o.status === "PARTIALLY_FULFILLED") && <Button size="sm" loading={action.isPending} onClick={() => action.mutate({ id: o.id, verb: "fulfill" })}>Entregar</Button>}
                    {o.status !== "CANCELLED" && o.paymentStatus !== "PAID" && <Button size="sm" variant="outline" onClick={() => setPaying(o)}><CreditCard className="h-4 w-4" /> Cobrar</Button>}
                    {o.status !== "CANCELLED" && o.status !== "DRAFT" && <Button size="sm" variant="outline" loading={issueNote.isPending} onClick={() => issueNote.mutate(o.id)}><Receipt className="h-4 w-4" /> Nota</Button>}
                    {(o.status === "DRAFT" || o.status === "CONFIRMED") && <Button size="sm" variant="ghost" onClick={() => action.mutate({ id: o.id, verb: "cancel" })}>Cancelar</Button>}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CreateOrderDialog open={creating} onClose={() => setCreating(false)} customers={customers ?? []}
        onCreated={async () => { setCreating(false); await refresh(); toast.push("Pedido creado", "success"); }} />
      <PaymentDialog order={paying} onClose={() => setPaying(null)}
        onDone={async () => { setPaying(null); await refresh(); toast.push("Cobro registrado", "success"); }} />
    </div>
  );
}

function PaymentDialog({ order, onClose, onDone }: { order: Order | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ method: "CASH", amount: "", reference: "" });

  const pay = useMutation({
    mutationFn: () => api.post(`/payments`, {
      orderId: order!.id,
      method: form.method,
      amount: Number(form.amount || 0),
      reference: form.reference || undefined,
    }),
    onSuccess: () => { setForm({ method: "CASH", amount: "", reference: "" }); onDone(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <Dialog open={!!order} onClose={onClose} title={`Cobrar pedido ${order?.number ?? ""}`}
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={pay.isPending} onClick={() => {
          if (!(Number(form.amount) > 0)) return toast.push("Ingresa el monto", "error");
          pay.mutate();
        }}>Cobrar</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-gray-500">Total del pedido: <span className="font-semibold text-gray-900">${Number(order?.total ?? 0).toFixed(2)}</span></p>
        <FormField label="Método">
          <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="CASH">Efectivo</option>
            <option value="CARD">Tarjeta</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="OTHER">Otro</option>
          </Select>
        </FormField>
        <FormField label="Monto"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></FormField>
        <FormField label="Referencia (opcional)"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></FormField>
      </div>
    </Dialog>
  );
}

function CreateOrderDialog({ open, onClose, customers, onCreated }: {
  open: boolean; onClose: () => void; customers: Customer[]; onCreated: () => void;
}) {
  const toast = useToast();
  const { data: me } = useMe();
  const { data: variants } = useQuery({ queryKey: ["variants"], queryFn: () => api.get<Variant[]>("/variants"), enabled: open });
  const [customerId, setCustomerId] = useState("");
  const [rows, setRows] = useState<Array<{ variantId: string; qty: string; price: string }>>([{ variantId: "", qty: "", price: "" }]);
  const [delivery, setDelivery] = useState({ address: "", phone: "", locationUrl: "", notes: "" });

  const create = useMutation({
    mutationFn: () => api.post("/orders", {
      customerId: customerId || undefined,
      deliveryAddress: delivery.address || undefined,
      deliveryPhone: delivery.phone || undefined,
      deliveryLocationUrl: delivery.locationUrl || undefined,
      deliveryNotes: delivery.notes || undefined,
      items: rows
        .filter((r) => r.variantId && Number(r.qty) > 0)
        .map((r) => ({ variantId: r.variantId, quantity: Number(r.qty), unitPrice: r.price ? Number(r.price) : undefined })),
    }),
    onSuccess: () => { setRows([{ variantId: "", qty: "", price: "" }]); setCustomerId(""); setDelivery({ address: "", phone: "", locationUrl: "", notes: "" }); onCreated(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Nuevo pedido"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={create.isPending} onClick={() => {
          if (!me?.defaultWarehouse) return toast.push("No tienes un almacén asignado. Pídele a un admin que lo configure.", "error");
          if (!rows.some((r) => r.variantId && Number(r.qty) > 0)) return toast.push("Agrega al menos un renglón", "error");
          create.mutate();
        }}>Crear pedido</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Cliente (opcional)">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Mostrador</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Almacén">
            <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">{me?.defaultWarehouse?.name ?? "Sin almacén asignado"}</div>
          </FormField>
        </div>
        {rows.map((r, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-2">
            <Select value={r.variantId} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, variantId: e.target.value } : x))}>
              <option value="">Variante…</option>{variants?.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
            </Select>
            <Input type="number" placeholder="Cantidad" value={r.qty} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))} />
            <Input type="number" placeholder="Precio (opc.)" value={r.price} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, price: e.target.value } : x))} />
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { variantId: "", qty: "", price: "" }])}>+ Renglón</Button>
        <p className="text-xs text-gray-400">Si dejas el precio vacío se toma de la lista de precios vigente.</p>

        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-600">Entrega a domicilio (opcional)</p>
          <FormField label="Dirección"><Input value={delivery.address} onChange={(e) => setDelivery({ ...delivery, address: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Teléfono"><Input value={delivery.phone} onChange={(e) => setDelivery({ ...delivery, phone: e.target.value })} /></FormField>
            <FormField label="Ubicación (link)"><Input placeholder="https://maps…" value={delivery.locationUrl} onChange={(e) => setDelivery({ ...delivery, locationUrl: e.target.value })} /></FormField>
          </div>
          <FormField label="Notas de entrega"><Input value={delivery.notes} onChange={(e) => setDelivery({ ...delivery, notes: e.target.value })} /></FormField>
        </div>
      </div>
    </Dialog>
  );
}
