"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Pencil, Plus, UserSquare, Wallet } from "lucide-react";
import {
  Badge, Button, Dialog, EmptyState, FormField, Input, Select, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { Customer, CustomerAccount, CustomerInsights, CustomerZone } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

const money = (v?: string | null) => (v == null ? "—" : `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

const zoneLabel: Record<CustomerZone, string> = { NORTE: "Norte", SUR: "Sur", ESTE: "Este", OESTE: "Oeste", CENTRO: "Centro" };
const zoneTone: Record<CustomerZone, "blue" | "green" | "amber" | "gray" | "red"> = {
  NORTE: "blue", SUR: "green", ESTE: "amber", OESTE: "red", CENTRO: "gray",
};

export default function CustomersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Customer | "new" | null>(null);
  const [account, setAccount] = useState<Customer | null>(null);
  const [insights, setInsights] = useState<Customer | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["customers"], queryFn: () => api.get<Customer[]>("/customers") });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      api.patch(`/customers/${id}`, { status }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["customers"] }); toast.push("Cliente actualizado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-gray-500">Registro de clientes, zona de entrega y análisis de compra</p>
        </div>
        <Button onClick={() => setForm("new")}><Plus className="h-4 w-4" /> Nuevo</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<UserSquare className="h-8 w-8 text-gray-400" />} title="Sin clientes" />
      ) : (
        <Table>
          <THead><TR>
            <TH>Nº</TH><TH>Nombre</TH><TH>Celular</TH><TH>Zona</TH>
            <TH className="text-right">Pedidos</TH><TH>Última compra</TH><TH>Estado</TH><TH className="text-right">Acciones</TH>
          </TR></THead>
          <TBody>
            {data.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs text-gray-500">{c.code ?? "—"}</TD>
                <TD className="font-medium">{c.name}</TD>
                <TD className="text-gray-500">{c.phone ?? "—"}</TD>
                <TD>{c.zone ? <Badge tone={zoneTone[c.zone]}>{zoneLabel[c.zone]}</Badge> : <span className="text-gray-300">—</span>}</TD>
                <TD className="text-right tabular-nums">{c.orderCount ?? 0}</TD>
                <TD className="text-gray-500">{c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("es-MX") : "—"}</TD>
                <TD><Badge tone={c.status === "ACTIVE" ? "green" : "gray"}>{c.status}</Badge></TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setInsights(c)}><BarChart3 className="h-4 w-4" /> Análisis</Button>
                    <Button size="sm" variant="outline" onClick={() => setAccount(c)}><Wallet className="h-4 w-4" /> Cuenta</Button>
                    <Button size="sm" variant="ghost" onClick={() => setForm(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => setStatus.mutate({ id: c.id, status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}>
                      {c.status === "ACTIVE" ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CustomerFormDialog
        customer={form === "new" ? null : form}
        open={form !== null}
        onClose={() => setForm(null)}
        onSaved={async () => { setForm(null); await qc.invalidateQueries({ queryKey: ["customers"] }); toast.push("Cliente guardado", "success"); }}
      />
      <AccountDialog customer={account} onClose={() => setAccount(null)} />
      <InsightsDialog customer={insights} onClose={() => setInsights(null)} />
    </div>
  );
}

// --- Alta / edición de cliente ---
function CustomerFormDialog({ customer, open, onClose, onSaved }: {
  customer: Customer | null; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const editing = Boolean(customer);
  const empty = { code: "", name: "", type: "RETAIL", phone: "", zone: "", address: "", email: "", taxId: "", creditLimit: "" };
  const [f, setF] = useState(empty);

  // Sincroniza el formulario al abrir (con los datos del cliente o vacío).
  useEffect(() => {
    if (!open) return;
    setF(customer
      ? {
          code: customer.code ?? "", name: customer.name, type: customer.type, phone: customer.phone ?? "",
          zone: customer.zone ?? "", address: customer.address ?? "", email: customer.email ?? "",
          taxId: customer.taxId ?? "", creditLimit: customer.creditLimit ?? "",
        }
      : empty);
  }, [open, customer]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: f.code.trim() || undefined,
        name: f.name.trim(),
        type: f.type,
        phone: f.phone.trim() || undefined,
        zone: f.zone || undefined,
        address: f.address.trim() || undefined,
        email: f.email.trim() || undefined,
        taxId: f.taxId.trim() || undefined,
        creditLimit: f.creditLimit ? Number(f.creditLimit) : undefined,
      };
      return editing ? api.patch(`/customers/${customer!.id}`, body) : api.post("/customers", body);
    },
    onSuccess: onSaved,
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `Editar — ${customer?.name}` : "Nuevo cliente"}
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={save.isPending} onClick={() => f.name.trim() ? save.mutate() : toast.push("El nombre es requerido", "error")}>Guardar</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Nº de cliente">
            <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder={editing ? "" : "Automático (C-000N)"} />
          </FormField>
          <FormField label="Tipo">
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="RETAIL">Menudeo</option>
              <option value="WHOLESALE">Mayoreo</option>
            </Select>
          </FormField>
        </div>
        <FormField label="Nombre"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Celular"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="614…" /></FormField>
          <FormField label="Zona (Chihuahua)">
            <Select value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })}>
              <option value="">Sin zona</option>
              <option value="NORTE">Norte</option>
              <option value="SUR">Sur</option>
              <option value="ESTE">Este</option>
              <option value="OESTE">Oeste</option>
              <option value="CENTRO">Centro</option>
            </Select>
          </FormField>
        </div>
        <FormField label="Dirección (opcional)"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Calle, número, colonia…" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Correo (opcional)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormField>
          <FormField label="RFC (opcional)"><Input value={f.taxId} onChange={(e) => setF({ ...f, taxId: e.target.value })} /></FormField>
        </div>
        <FormField label="Límite de crédito (opcional)"><Input type="number" value={f.creditLimit} onChange={(e) => setF({ ...f, creditLimit: e.target.value })} /></FormField>
      </div>
    </Dialog>
  );
}

// --- Análisis del cliente ---
function InsightsDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["customer-insights", customer?.id], enabled: !!customer,
    queryFn: () => api.get<CustomerInsights>(`/customers/${customer!.id}/insights`),
  });
  const freq = (d: number | null) =>
    d == null ? "—" : d < 1 ? "varias veces al día" : d < 45 ? `cada ${d} días` : `cada ${Math.round(d / 30)} meses`;

  return (
    <Dialog open={!!customer} onClose={onClose} title={`Análisis — ${customer?.name ?? ""}`}
      footer={<Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>}>
      {!data ? <Skeleton className="h-56 w-full" /> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Pedidos" value={String(data.summary.orderCount)} />
            <Stat label="Total comprado" value={money(data.summary.totalSpent)} />
            <Stat label="Ticket promedio" value={money(data.summary.avgTicket)} />
            <Stat label="Frecuencia" value={freq(data.summary.avgDaysBetween)} />
            <Stat label="Última compra" value={data.summary.daysSinceLast == null ? "—" : `hace ${data.summary.daysSinceLast} días`} accent />
            <Stat label="Cliente desde" value={data.summary.firstOrderAt ? new Date(data.summary.firstOrderAt).toLocaleDateString("es-MX") : "—"} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TopList title="Sabores favoritos" rows={data.topFlavors} />
            <TopList title="Modelos favoritos" rows={data.topModels} />
            <TopList title="Marcas favoritas" rows={data.topBrands} />
          </div>
        </div>
      )}
    </Dialog>
  );
}

function TopList({ title, rows }: { title: string; rows: Array<{ label: string; units: string }> }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      {rows.length === 0 ? <p className="text-gray-400">Sin datos.</p> : (
        <ul className="space-y-1">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex items-center justify-between rounded-md bg-gray-50 px-2 py-1">
              <span className="truncate pr-2">{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-600">{r.units}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Estado de cuenta (existente) ---
function AccountDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["customer-account", customer?.id], enabled: !!customer,
    queryFn: () => api.get<CustomerAccount>(`/customers/${customer!.id}/account`),
  });
  return (
    <Dialog open={!!customer} onClose={onClose} title={`Estado de cuenta — ${customer?.name ?? ""}`}
      footer={<Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>}>
      {!data ? <Skeleton className="h-48 w-full" /> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Comprado" value={money(data.summary.charges)} />
            <Stat label="Pagado" value={money(data.summary.paid)} />
            <Stat label="Devuelto" value={money(data.summary.credited)} />
            <Stat label="Crédito a favor" value={money(data.summary.creditInFavor)} />
            <Stat label="Saldo" value={money(data.summary.balance)} accent />
            {data.creditLimit != null && <Stat label="Crédito disponible" value={money(data.creditAvailable)} />}
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Pedidos ({data.orders.length})</p>
            {data.orders.length === 0 ? <p className="text-gray-400">Sin pedidos.</p> : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200">
                <Table>
                  <THead><TR><TH>Folio</TH><TH>Fecha</TH><TH>Estado</TH><TH>Pago</TH><TH className="text-right">Total</TH></TR></THead>
                  <TBody>
                    {data.orders.map((o) => (
                      <TR key={o.id}>
                        <TD className="font-mono text-xs">{o.number}</TD>
                        <TD className="text-gray-500">{new Date(o.date).toLocaleDateString("es-MX")}</TD>
                        <TD><Badge tone={o.status === "COMPLETED" ? "green" : "gray"}>{o.status}</Badge></TD>
                        <TD><Badge tone={o.paymentStatus === "PAID" ? "green" : o.paymentStatus === "PARTIAL" ? "amber" : "gray"}>{o.paymentStatus}</Badge></TD>
                        <TD className="text-right">{money(o.total)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </div>

          {data.creditNotes.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Notas de crédito ({data.creditNotes.length})</p>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200">
                <Table>
                  <THead><TR><TH>Folio</TH><TH>Fecha</TH><TH>Reembolso</TH><TH className="text-right">Total</TH></TR></THead>
                  <TBody>
                    {data.creditNotes.map((c) => (
                      <TR key={c.id}>
                        <TD className="font-mono text-xs">{c.number}</TD>
                        <TD className="text-gray-500">{new Date(c.date).toLocaleDateString("es-MX")}</TD>
                        <TD>{c.refundMethod ? <Badge tone="blue">{c.refundMethod}</Badge> : <span className="text-gray-400">crédito a favor</span>}</TD>
                        <TD className="text-right">{money(c.total)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-brand/30 bg-brand/5" : "border-gray-200 bg-white"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
