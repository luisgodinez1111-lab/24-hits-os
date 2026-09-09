"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCheck, CreditCard, Plus, Route as RouteIcon } from "lucide-react";
import {
  Badge, Button, Dialog, EmptyState, ErrorState, FormField, Input, PageHeader, Segmented,   Table, TBody, TD, TH, THead, TR, useToast,
  TableSkeleton,
} from "@24hits/ui";
import type { Customer, Order } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { QuickOrderDialog } from "@/components/QuickOrderDialog";
import { haversineKm } from "@/lib/route";

// UNA etapa humana derivada de los 3 estados internos (estado/pago/entrega). El
// operador ve una sola etiqueta y una sola acción, no la maquinaria (reserva/COGS).
type Stage = { label: string; tone: "gray" | "amber" | "blue" | "green" | "red" };
function stageOf(o: Order): Stage {
  if (o.status === "CANCELLED") return { label: "Cancelado", tone: "red" };
  const delivered = o.deliveryStatus === "DELIVERED" || o.status === "FULFILLED" || o.status === "COMPLETED";
  if (delivered) {
    return o.paymentStatus === "PAID"
      ? { label: "Entregado y cobrado", tone: "green" }
      : { label: "Entregado · por cobrar", tone: "amber" };
  }
  if (o.deliveryStatus === "DISPATCHED") return { label: "En ruta", tone: "blue" };
  return { label: "Nuevo", tone: "gray" };
}
function isDelivered(o: Order): boolean {
  return o.deliveryStatus === "DELIVERED" || o.status === "FULFILLED" || o.status === "COMPLETED";
}

// Prueba de entrega (geo-sello): "14:32 · a 8 m · recibió Juan". La distancia es entre
// el punto de entrega del pedido y donde el repartidor marcó entregado (evidencia de
// que estuvo en el lugar). Devuelve null si el pedido aún no se entrega.
function deliveryProof(o: Order): string | null {
  if (o.deliveryStatus !== "DELIVERED" || !o.deliveredAt) return null;
  const time = new Date(o.deliveredAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  let dist = "";
  if (o.deliveredLat != null && o.deliveredLng != null && o.deliveryLat != null && o.deliveryLng != null) {
    const m = haversineKm({ lat: o.deliveredLat, lng: o.deliveredLng }, { lat: o.deliveryLat, lng: o.deliveryLng }) * 1000;
    dist = m < 950 ? ` · a ${Math.round(m)} m` : ` · a ${(m / 1000).toFixed(1)} km`;
  }
  const who = o.deliveryRecipient ? ` · recibió ${o.deliveryRecipient}` : "";
  return `${time}${dist}${who}`;
}

export default function SalesOrdersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const [locating, setLocating] = useState<Order | null>(null);
  const [filter, setFilter] = useState<"all" | "unpaid" | "pending">("all");
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["sales-orders"], queryFn: () => api.get<Order[]>("/orders") });
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => api.get<Customer[]>("/customers") });

  // Deep-link: "?pay=unpaid" (por cobrar) o "?delivery=pending" (por entregar), desde
  // el Inicio y desde Caja → aterriza en la lista ya filtrada.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("pay") === "unpaid") setFilter("unpaid");
    else if (q.get("delivery") === "pending") setFilter("pending");
  }, []);

  const customerName = (id: string | null) => (id ? customers?.find((c) => c.id === id)?.name ?? id.slice(0, 8) : "Mostrador");
  const refresh = () => qc.invalidateQueries({ queryKey: ["sales-orders"] });
  const matchesFilter = (o: Order) =>
    filter === "all" ? true
      : filter === "unpaid" ? o.status !== "CANCELLED" && o.paymentStatus !== "PAID"
        : o.deliveryStatus === "PENDING" || o.deliveryStatus === "DISPATCHED";
  const shown = (data ?? []).filter(matchesFilter);

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

  // Genera y copia el link PÚBLICO de rastreo para compartir con el cliente.
  async function shareTracking(orderId: string) {
    try {
      const { token } = await api.get<{ token: string }>(`/orders/${orderId}/track-token`);
      const url = `${window.location.origin}/track/${token}`;
      await navigator.clipboard.writeText(url);
      toast.push("Link de rastreo copiado — compártelo con el cliente", "success");
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "No se pudo generar el link", "error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle="Confirmar reserva stock · entregar consume inventario y captura COGS"
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/app/sales/route")}><RouteIcon className="h-4 w-4" /> Ruta de hoy</Button>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo</Button>
          </>
        }
      />

      {isLoading ? (
        <TableSkeleton cols={5} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-8 w-8 text-gray-400" />}
          title="Sin pedidos"
          description="Crea tu primer pedido para confirmarlo, entregarlo y cobrarlo."
          action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo pedido</Button>}
        />
      ) : (
        <>
          <div className="mb-3">
            <Segmented
              ariaLabel="Filtrar pedidos"
              value={filter}
              onChange={(v) => setFilter(v)}
              options={[
                { value: "all", label: `Todos (${data.length})` },
                { value: "unpaid", label: "Por cobrar" },
                { value: "pending", label: "Por entregar" },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={<ClipboardCheck className="h-8 w-8 text-gray-400" />} title="Sin resultados" description="Ningún pedido con este filtro." />
          ) : (
          <Table stickyHeader>
          <THead><TR><TH>Folio</TH><TH>Cliente</TH><TH className="text-right">Total</TH><TH>Etapa</TH><TH className="text-right">Acción</TH></TR></THead>
          <TBody>
            {shown.map((o) => {
              const st = stageOf(o);
              const delivered = isDelivered(o);
              return (
              <TR key={o.id}>
                <TD className="font-mono text-xs">{o.number}</TD>
                <TD className="font-medium">
                  {o.customerId
                    ? <Link href={`/app/sales/customers/${o.customerId}`} className="text-brand hover:underline">{customerName(o.customerId)}</Link>
                    : customerName(o.customerId)}
                  {/* Qué se entrega: vape (modelo) · sabor · cantidad, por renglón. */}
                  {o.items?.length ? (
                    <ul className="mt-1 space-y-0.5 font-normal">
                      {o.items.map((it) => (
                        <li key={it.id} className="text-xs text-gray-500">
                          {it.productName ?? it.variantName ?? it.sku ?? "Producto"}
                          {it.flavorName ? <span className="text-gray-400"> · {it.flavorName}</span> : null}
                          <span className="ml-1 font-mono tabular-nums text-gray-400">×{Number(it.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </TD>
                <TD className="text-right font-mono tabular-nums">${Number(o.total).toFixed(2)}</TD>
                {/* UNA etapa humana (esconde estado/pago/entrega internos). */}
                <TD>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {deliveryProof(o) && (
                    <p className="mt-1 text-[11px] text-gray-400" title="Prueba de entrega: hora y distancia entre el punto de entrega y donde se marcó entregado">✓ {deliveryProof(o)}</p>
                  )}
                </TD>
                {/* UNA acción principal + secundarias discretas. */}
                <TD className="text-right">
                  <div className="flex flex-col items-end gap-1.5">
                    {o.status !== "CANCELLED" && !delivered && o.deliveryStatus === "DISPATCHED" && (
                      <Button size="sm" loading={delivery.isPending} onClick={() => delivery.mutate({ id: o.id, status: "DELIVERED" })}><Check className="h-4 w-4" /> Marcar entregado</Button>
                    )}
                    {o.status !== "CANCELLED" && !delivered && o.deliveryStatus !== "DISPATCHED" && (
                      <Button size="sm" loading={delivery.isPending} onClick={() => delivery.mutate({ id: o.id, status: "DISPATCHED" })}><RouteIcon className="h-4 w-4" /> Enviar a ruta</Button>
                    )}
                    {delivered && o.paymentStatus !== "PAID" && (
                      <Button size="sm" onClick={() => setPaying(o)}><CreditCard className="h-4 w-4" /> Cobrar</Button>
                    )}
                    <div className="flex flex-wrap justify-end gap-x-3 text-xs">
                      {(o.deliveryLat == null || o.deliveryLng == null) && o.status !== "CANCELLED" ? (
                        <button onClick={() => setLocating(o)} className="text-amber-600 hover:underline">Falta ubicación</button>
                      ) : o.deliveryStatus !== "DELIVERED" && o.status !== "CANCELLED" ? (
                        <button onClick={() => shareTracking(o.id)} className="text-gray-500 hover:text-brand hover:underline">Rastreo</button>
                      ) : null}
                      {!delivered && o.paymentStatus !== "PAID" && o.status !== "CANCELLED" && (
                        <button onClick={() => setPaying(o)} className="text-gray-500 hover:text-brand hover:underline">Cobrar</button>
                      )}
                      {o.status !== "CANCELLED" && o.status !== "DRAFT" && (
                        <button onClick={() => issueNote.mutate(o.id)} className="text-gray-500 hover:text-brand hover:underline">Nota</button>
                      )}
                      {!delivered && o.status !== "CANCELLED" && (
                        <button onClick={() => action.mutate({ id: o.id, verb: "cancel" })} className="text-gray-400 hover:text-red-600 hover:underline">Cancelar</button>
                      )}
                    </div>
                  </div>
                </TD>
              </TR>
              );
            })}
          </TBody>
        </Table>
          )}
        </>
      )}

      <QuickOrderDialog open={creating} onClose={() => setCreating(false)} customers={customers ?? []}
        onCreated={async () => { setCreating(false); await refresh(); toast.push("Pedido creado ✓", "success"); }} />
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

  // Comisión por tarjeta: +$15 si es TARJETA (efectivo/transferencia sin comisión).
  const orderTotal = Number(order?.total ?? 0);
  const surcharge = form.method === "CARD" ? 15 : 0;
  const chargeTotal = orderTotal + surcharge;
  // Prefill del monto a cobrar según el método (se recalcula al cambiar de método).
  useEffect(() => {
    if (order) setForm((f) => ({ ...f, amount: String(Number(order.total ?? 0) + (f.method === "CARD" ? 15 : 0)) }));
  }, [order, form.method]);

  const pay = useMutation({
    mutationFn: () => api.post(`/payments`, {
      orderId: order!.id,
      method: form.method,
      amount: Number(form.amount || 0),
      reference: form.reference || (form.method === "CARD" ? "Incluye $15 comisión tarjeta" : undefined),
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
        <p className="text-sm text-gray-500">Total del pedido: <span className="font-mono font-semibold text-gray-900 tabular-nums">${orderTotal.toFixed(2)}</span></p>
        {surcharge > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Con tarjeta se cobra comisión: ${orderTotal.toFixed(2)} + ${surcharge.toFixed(2)} = <b className="tabular-nums">${chargeTotal.toFixed(2)}</b>
          </p>
        )}
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

