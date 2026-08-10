"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserSquare } from "lucide-react";
import {
  Badge, Button, Dialog, EmptyState, FormField, Input, Select, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { Customer } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

export default function CustomersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
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
                  <Button size="sm" variant="outline"
                    onClick={() => setStatus.mutate({ id: c.id, status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}>
                    {c.status === "ACTIVE" ? "Desactivar" : "Activar"}
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CreateCustomerDialog open={creating} onClose={() => setCreating(false)}
        onCreated={async () => { setCreating(false); await qc.invalidateQueries({ queryKey: ["customers"] }); toast.push("Cliente creado", "success"); }} />
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
