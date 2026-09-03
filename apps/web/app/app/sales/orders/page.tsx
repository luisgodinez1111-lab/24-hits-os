"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, CreditCard, MapPin, Plus, Receipt } from "lucide-react";
import {
  Badge, Button, Combobox, Dialog, EmptyState, ErrorState, FormField, Input, PageHeader, Segmented, Skeleton,
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
// Etiquetas legibles (antes se mostraba el enum crudo: DRAFT, PENDING…).
const statusLabel: Record<string, string> = {
  DRAFT: "Borrador", CONFIRMED: "Confirmado", PARTIALLY_FULFILLED: "Parcial",
  FULFILLED: "Entregado", COMPLETED: "Completado", CANCELLED: "Cancelado",
};
const payLabel: Record<string, string> = { PENDING: "Pendiente", PARTIAL: "Parcial", PAID: "Pagado" };

export default function SalesOrdersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const [locating, setLocating] = useState<Order | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["sales-orders"], queryFn: () => api.get<Order[]>("/orders") });
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

  // Corregir ubicación de un pedido existente: re-resuelve el link (incluye los
  // links cortos de Google) y avisa si encontró o no las coordenadas.
  const saveLocation = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) => api.patch<Order>(`/orders/${id}/delivery`, { deliveryLocationUrl: url }),
    onSuccess: async (order) => {
      await refresh();
      setLocating(null);
      if (order.deliveryLat != null && order.deliveryLng != null) toast.push("Ubicación encontrada ✓ — ya aparece en la ruta", "success");
      else toast.push("Guardado, pero ese link no tiene ubicación. Usa el botón Compartir de Google Maps o pega el enlace completo.", "error");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle="Confirmar reserva stock · entregar consume inventario y captura COGS"
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo</Button>}
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="h-8 w-8 text-gray-400" />} title="Sin pedidos" />
      ) : (
        <Table stickyHeader>
          <THead><TR><TH>Folio</TH><TH>Cliente</TH><TH className="text-right">Total</TH><TH>Estado</TH><TH>Pago</TH><TH>Entrega</TH><TH className="text-right">Acciones</TH></TR></THead>
          <TBody>
            {data.map((o) => (
              <TR key={o.id}>
                <TD className="font-mono text-xs">{o.number}</TD>
                <TD className="font-medium">{customerName(o.customerId)}</TD>
                <TD className="text-right">${Number(o.total).toFixed(2)}</TD>
                <TD><Badge tone={tone[o.status] ?? "gray"}>{statusLabel[o.status] ?? o.status}</Badge></TD>
                <TD><Badge tone={payTone[o.paymentStatus] ?? "gray"}>{payLabel[o.paymentStatus] ?? o.paymentStatus}</Badge></TD>
                <TD>
                  {o.deliveryStatus ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={deliveryTone[o.deliveryStatus] ?? "gray"}>{deliveryLabel[o.deliveryStatus] ?? o.deliveryStatus}</Badge>
                      {o.deliveryStatus === "PENDING" && <Button size="sm" variant="ghost" loading={delivery.isPending} onClick={() => delivery.mutate({ id: o.id, status: "DISPATCHED" })}>Enviar</Button>}
                      {o.deliveryStatus === "DISPATCHED" && <Button size="sm" variant="ghost" loading={delivery.isPending} onClick={() => delivery.mutate({ id: o.id, status: "DELIVERED" })}>Entregado</Button>}
                      {/* Sin coordenadas = no aparece en la ruta: se ofrece corregir. */}
                      {o.deliveryLat == null || o.deliveryLng == null ? (
                        <Button size="sm" variant="outline" onClick={() => setLocating(o)}><MapPin className="h-4 w-4" /> Corregir ubicación</Button>
                      ) : (
                        <button onClick={() => setLocating(o)} className="inline-flex items-center gap-1 text-xs text-brand underline"><MapPin className="h-3.5 w-3.5" /> ubicación ✓</button>
                      )}
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
      <LocationDialog order={locating} onClose={() => setLocating(null)} pending={saveLocation.isPending}
        onSave={(url) => locating && saveLocation.mutate({ id: locating.id, url })} />
    </div>
  );
}

// Corrige la ubicación de un pedido: pega el link de Maps (corto o largo) y el
// backend re-resuelve las coordenadas. Muestra si el pedido ya tiene ubicación.
function LocationDialog({ order, onClose, onSave, pending }: { order: Order | null; onClose: () => void; onSave: (url: string) => void; pending: boolean }) {
  const [url, setUrl] = useState("");
  // Pre-llena con el link actual: reabrir y Guardar re-resuelve un link corto.
  useEffect(() => { setUrl(order?.deliveryLocationUrl ?? ""); }, [order]);
  const hasCoords = order?.deliveryLat != null && order?.deliveryLng != null;
  return (
    <Dialog open={!!order} onClose={onClose} title={`Ubicación · pedido ${order?.number ?? ""}`}
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={pending} onClick={() => { const v = url.trim(); if (!v) return; onSave(v); }}>Guardar ubicación</Button></>}>
      <div className="space-y-3">
        <p className={`text-sm ${hasCoords ? "text-green-700" : "text-amber-700"}`}>
          {hasCoords ? "✓ Este pedido ya tiene ubicación en el mapa. Puedes reemplazarla." : "⚠️ Este pedido no tiene ubicación, por eso no aparece en la ruta."}
        </p>
        <FormField label="Link de Google/Apple Maps">
          <Input autoFocus placeholder="https://maps.app.goo.gl/… o https://maps…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </FormField>
        <p className="text-xs text-gray-400">
          En Google Maps: mantén presionada la dirección → <b>Compartir</b> → copia el enlace y pégalo aquí. También sirve el enlace largo o unas coordenadas <span className="font-mono">28.63,-106.07</span>.
        </p>
      </div>
    </Dialog>
  );
}

function PaymentDialog({ order, onClose, onDone }: { order: Order | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<{ method: "CASH" | "CARD" | "TRANSFER" | "OTHER"; amount: string; reference: string }>({ method: "CASH", amount: "", reference: "" });

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
          <Segmented
            full
            ariaLabel="Método de pago"
            value={form.method}
            onChange={(m) => setForm({ ...form, method: m })}
            options={[
              { value: "CASH", label: "Efectivo" },
              { value: "CARD", label: "Tarjeta" },
              { value: "TRANSFER", label: "Transf." },
              { value: "OTHER", label: "Otro" },
            ]}
          />
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
            <Combobox
              value={customerId}
              onChange={setCustomerId}
              placeholder="Mostrador"
              options={[{ value: "", label: "Mostrador" }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </FormField>
          <FormField label="Almacén">
            <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">{me?.defaultWarehouse?.name ?? "Sin almacén asignado"}</div>
          </FormField>
        </div>
        {rows.map((r, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-2">
            <Combobox
              value={r.variantId}
              onChange={(v) => setRows(rows.map((x, i) => (i === idx ? { ...x, variantId: v } : x)))}
              placeholder="Variante…"
              options={(variants ?? []).map((v) => ({ value: v.id, label: `${v.sku} · ${v.name}` }))}
            />
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
