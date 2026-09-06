"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, ScanLine } from "lucide-react";
import {
  Badge, Button, Card, CardBody, Combobox, Dialog, EmptyState, FormField, Input, Select,   Table, TBody, TD, TH, THead, TR, useToast,
  PageHeader,
  TableSkeleton,
} from "@24hits/ui";
import type { Brand, Category, ProductListItem, ProductPage } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { QuickRegisterDialog } from "@/components/QuickRegisterDialog";
import { FlavorsDialog } from "@/components/FlavorsDialog";

// Referencia mínima a un modelo (lo único que necesita el editor de sabores).
type ModelRef = { id: string; name: string };

const statusTone: Record<ProductListItem["status"], "green" | "gray" | "amber" | "red"> = {
  ACTIVE: "green", DRAFT: "amber", INACTIVE: "gray", DISCONTINUED: "red",
};

export default function ProductsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [brandId, setBrandId] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [flavorsFor, setFlavorsFor] = useState<ModelRef | null>(null);

  const { data: brands } = useQuery({ queryKey: ["brands"], queryFn: () => api.get<Brand[]>("/brands") });
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (brandId) params.set("brandId", brandId);
  if (status) params.set("status", status);

  const { data, isLoading } = useQuery({
    queryKey: ["products", search, brandId, status],
    queryFn: () => api.get<ProductPage>(`/products?${params.toString()}`),
  });

  return (
    <div>
      <PageHeader
        title="Modelos"
        subtitle="Tus productos. Entra a un modelo para agregar sus sabores con código y precio."
        actions={
          <>
            <Button variant="outline" onClick={() => setQuickOpen(true)}><ScanLine className="h-4 w-4" /> Alta por escaneo</Button>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo modelo</Button>
          </>
        }
      />

      <Card className="mb-6">
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Buscar (modelo o SKU)">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Elfbar BC5000…" />
          </FormField>
          <FormField label="Marca">
            <Combobox
              value={brandId}
              onChange={setBrandId}
              placeholder="Todas"
              options={[{ value: "", label: "Todas" }, ...(brands ?? []).map((b) => ({ value: b.id, label: b.name }))]}
            />
          </FormField>
          <FormField label="Estado">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="ACTIVE">Activo</option>
              <option value="DRAFT">Borrador</option>
              <option value="INACTIVE">Inactivo</option>
              <option value="DISCONTINUED">Descontinuado</option>
            </Select>
          </FormField>
        </CardBody>
      </Card>

      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8 text-gray-400" />}
          title="Sin modelos"
          description="Crea tu primer modelo y agrégale marca y sabores."
          action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo modelo</Button>}
        />
      ) : (
        <Table stickyHeader>
          <THead>
            <TR><TH>Modelo</TH><TH>Marca</TH><TH>Categoría</TH><TH className="text-right">Sabores</TH><TH>Estado</TH><TH>{" "}</TH></TR>
          </THead>
          <TBody>
            {data.items.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.name}</TD>
                <TD className="text-gray-500">{p.brand?.name ?? "—"}</TD>
                <TD className="text-gray-500">{p.category?.name ?? "—"}</TD>
                <TD className="text-right">{p._count.variants}</TD>
                <TD><Badge tone={statusTone[p.status]}>{p.status}</Badge></TD>
                <TD className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setFlavorsFor(p)}>Sabores</Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CreateModelDialog open={creating} onClose={() => setCreating(false)} brands={brands ?? []}
        onCreated={async (model) => {
          setCreating(false);
          await qc.invalidateQueries({ queryKey: ["products"] });
          toast.push("Modelo creado — ahora agrega sus sabores", "success");
          setFlavorsFor(model); // abre el editor de sabores del nuevo modelo
        }} />
      <QuickRegisterDialog open={quickOpen} onClose={() => setQuickOpen(false)}
        onRegistered={async () => { await qc.invalidateQueries({ queryKey: ["products"] }); }} />
      <FlavorsDialog model={flavorsFor} onClose={() => setFlavorsFor(null)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["products"] })} />
    </div>
  );
}

function CreateModelDialog({ open, onClose, brands, onCreated }: {
  open: boolean; onClose: () => void; brands: Brand[]; onCreated: (model: ModelRef) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });
  const [form, setForm] = useState({ name: "", brandId: "", categoryId: "", status: "ACTIVE" });
  const create = useMutation({
    mutationFn: () => api.post<ModelRef>("/products", {
      name: form.name, brandId: form.brandId || undefined, categoryId: form.categoryId || undefined, status: form.status,
    }),
    onSuccess: (model) => { setForm({ name: "", brandId: "", categoryId: "", status: "ACTIVE" }); onCreated(model); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Nuevo modelo"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={create.isPending} onClick={() => form.name.trim() && create.mutate()}>Crear modelo</Button></>}>
      <div className="space-y-3">
        <FormField label="Nombre del modelo"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Elfbar BC5000" /></FormField>
        <FormField label="Marca">
          <Combobox
            value={form.brandId}
            onChange={(v) => setForm({ ...form, brandId: v })}
            placeholder="Sin marca"
            options={[{ value: "", label: "Sin marca" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
            allowCreate
            onCreate={async (name) => {
              const b = await api.post<Brand>("/brands", { name });
              await qc.invalidateQueries({ queryKey: ["brands"] });
              return b.id;
            }}
          />
        </FormField>
        <FormField label="Categoría (opcional)">
          <Combobox
            value={form.categoryId}
            onChange={(v) => setForm({ ...form, categoryId: v })}
            placeholder="Sin categoría"
            options={[{ value: "", label: "Sin categoría" }, ...(categories ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            allowCreate
            onCreate={async (name) => {
              const c = await api.post<Category>("/categories", { name });
              await qc.invalidateQueries({ queryKey: ["categories"] });
              return c.id;
            }}
          />
        </FormField>
        <FormField label="Estado">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ACTIVE">Activo</option><option value="DRAFT">Borrador</option>
          </Select>
        </FormField>
        <p className="text-[11px] text-gray-400">Después de crear el modelo, agregarás sus sabores.</p>
      </div>
    </Dialog>
  );
}

