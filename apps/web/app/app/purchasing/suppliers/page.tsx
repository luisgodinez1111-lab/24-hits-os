"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Contact, Plus } from "lucide-react";
import {
  Badge, Button, Dialog, EmptyState, FormField, Input,   Table, TBody, TD, TH, THead, TR, useToast,
  PageHeader,
  TableSkeleton,
} from "@24hits/ui";
import type { Supplier } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

export default function SuppliersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["suppliers"], queryFn: () => api.get<Supplier[]>("/suppliers") });

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Catálogo de proveedores"
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo</Button>}
      />

      {isLoading ? (
        <TableSkeleton cols={5} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Contact className="h-8 w-8 text-gray-400" />} title="Sin proveedores" />
      ) : (
        <Table stickyHeader>
          <THead><TR><TH>Nombre</TH><TH>RFC</TH><TH>Correo</TH><TH>Moneda</TH><TH>Estado</TH></TR></THead>
          <TBody>
            {data.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD className="font-mono text-xs text-gray-500">{s.taxId ?? "—"}</TD>
                <TD className="text-gray-500">{s.email ?? "—"}</TD>
                <TD>{s.currency}</TD>
                <TD><Badge tone={s.status === "ACTIVE" ? "green" : "gray"}>{s.status}</Badge></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CreateSupplierDialog open={creating} onClose={() => setCreating(false)}
        onCreated={async () => { setCreating(false); await qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.push("Proveedor creado", "success"); }} />
    </div>
  );
}

function CreateSupplierDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", taxId: "", email: "", phone: "" });
  const create = useMutation({
    mutationFn: () => api.post("/suppliers", {
      name: form.name, taxId: form.taxId || undefined, email: form.email || undefined, phone: form.phone || undefined,
    }),
    onSuccess: () => { setForm({ name: "", taxId: "", email: "", phone: "" }); onCreated(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Nuevo proveedor"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={create.isPending} onClick={() => form.name.trim() && create.mutate()}>Crear</Button></>}>
      <div className="space-y-3">
        <FormField label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="RFC"><Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></FormField>
        <FormField label="Correo"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        <FormField label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
      </div>
    </Dialog>
  );
}
