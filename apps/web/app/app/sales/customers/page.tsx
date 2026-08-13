"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserSquare, Wallet } from "lucide-react";
import {
  Badge, Button, Dialog, EmptyState, FormField, Input, Select, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { Customer, CustomerAccount } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

const money = (v?: string | null) => (v == null ? "—" : `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default function CustomersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [account, setAccount] = useState<Customer | null>(null);
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
          <p className="text-sm text-gray-500">Menudeo y mayoreo</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<UserSquare className="h-8 w-8 text-gray-400" />} title="Sin clientes" />
      ) : (
        <Table>
          <THead><TR><TH>Nombre</TH><TH>Tipo</TH><TH>Correo</TH><TH>RFC</TH><TH>Estado</TH><TH className="text-right">Acciones</TH></TR></THead>
          <TBody>
            {data.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD><Badge tone={c.type === "WHOLESALE" ? "blue" : "gray"}>{c.type === "WHOLESALE" ? "Mayoreo" : "Menudeo"}</Badge></TD>
                <TD className="text-gray-500">{c.email ?? "—"}</TD>
                <TD className="font-mono text-xs text-gray-500">{c.taxId ?? "—"}</TD>
                <TD><Badge tone={c.status === "ACTIVE" ? "green" : "gray"}>{c.status}</Badge></TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setAccount(c)}><Wallet className="h-4 w-4" /> Estado de cuenta</Button>
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

      <CreateCustomerDialog open={creating} onClose={() => setCreating(false)}
        onCreated={async () => { setCreating(false); await qc.invalidateQueries({ queryKey: ["customers"] }); toast.push("Cliente creado", "success"); }} />
      <AccountDialog customer={account} onClose={() => setAccount(null)} />
    </div>
  );
}

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

function CreateCustomerDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", type: "RETAIL", email: "", phone: "", taxId: "", creditLimit: "" });
  const create = useMutation({
    mutationFn: () => api.post("/customers", {
      name: form.name,
      type: form.type,
      email: form.email || undefined,
      phone: form.phone || undefined,
      taxId: form.taxId || undefined,
      creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
    }),
    onSuccess: () => { setForm({ name: "", type: "RETAIL", email: "", phone: "", taxId: "", creditLimit: "" }); onCreated(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Nuevo cliente"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={create.isPending} onClick={() => form.name.trim() && create.mutate()}>Crear</Button></>}>
      <div className="space-y-3">
        <FormField label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="Tipo">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="RETAIL">Menudeo</option>
            <option value="WHOLESALE">Mayoreo</option>
          </Select>
        </FormField>
        <FormField label="Correo"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        <FormField label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
        <FormField label="RFC"><Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></FormField>
        <FormField label="Límite de crédito"><Input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} /></FormField>
      </div>
    </Dialog>
  );
}
