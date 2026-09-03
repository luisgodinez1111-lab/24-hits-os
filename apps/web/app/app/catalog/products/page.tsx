"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, ChevronDown, Package, Plus, ScanLine } from "lucide-react";
import {
  Badge, Button, Card, CardBody, Combobox, Dialog, EmptyState, FormField, Input, Select,   Table, TBody, TD, TH, THead, TR, useToast,
  PageHeader,
  TableSkeleton,
} from "@24hits/ui";
import type { Brand, Category, Flavor, ProductListItem, ProductPage, Variant } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { hasPermission, useMe } from "@/lib/me";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { QuickRegisterDialog } from "@/components/QuickRegisterDialog";

// Precio "$180.00" o "—" si no tiene.
const money = (v?: string | null) => (v != null ? `$${Number(v).toFixed(2)}` : "—");

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
        subtitle="Marca → modelo → sabores"
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
        <EmptyState icon={<Package className="h-8 w-8 text-gray-400" />} title="Sin modelos" description="Crea el primero con “Nuevo modelo”." />
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

// Editor de sabores de un modelo. Alta fácil: escribe el sabor (y su precio
// opcional) — el SKU y la unidad se generan solos. El código de barras se agrega
// por sabor (escaneándolo) más abajo.
function FlavorsDialog({ model, onClose, onChanged }: {
  model: ModelRef | null; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const enabled = Boolean(model);
  const { data: me } = useMe();
  const canPrice = hasPermission(me, "pricing.manage");
  const { data: detail, refetch } = useQuery({
    queryKey: ["product", model?.id],
    queryFn: () => api.get<{ variants: Variant[] }>(`/products/${model!.id}`),
    enabled,
  });
  const { data: flavors } = useQuery({ queryKey: ["flavors"], queryFn: () => api.get<Flavor[]>("/flavors"), enabled });
  const [flavorName, setFlavorName] = useState("");
  const [price, setPrice] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post(`/products/${model!.id}/variants`, {
      flavorName: flavorName.trim(),
      name: flavorName.trim(),
      ...(price.trim() ? { price: Number(price) } : {}),
    }),
    onSuccess: async () => {
      setFlavorName(""); setPrice("");
      await refetch();
      void qc.invalidateQueries({ queryKey: ["flavors"] });
      onChanged();
      toast.push("Sabor agregado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <Dialog open={enabled} onClose={onClose} title={`Sabores — ${model?.name ?? ""}`}>
      <div className="space-y-3">
        {detail?.variants?.length ? (
          <div className="space-y-1">
            {detail.variants.map((v) => (
              <div key={v.id} className="rounded-lg border border-gray-200">
                <button type="button" onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <span className="font-medium">{v.flavor?.name ?? v.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">{money(v.price)}</span>
                    <Badge tone={v.barcodes && v.barcodes.length ? "green" : "gray"}>
                      <Barcode className="mr-1 inline h-3 w-3" />{v.barcodes?.length ?? 0}
                    </Badge>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded === v.id ? "rotate-180" : ""}`} />
                  </span>
                </button>
                {expanded === v.id && (
                  <div className="space-y-3 border-t border-gray-100 px-3 py-3">
                    {canPrice && <VariantPrice variant={v} onChanged={refetch} />}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-gray-500">Código(s) de barras de este sabor</p>
                      <VariantBarcodes variant={v} onChanged={refetch} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-400">Aún no hay sabores. Agrega el primero abajo.</p>}

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-2 text-xs font-semibold text-gray-600">Agregar sabor</p>
          <div className="grid grid-cols-2 gap-2">
            <Combobox
              value={flavorName}
              onChange={setFlavorName}
              placeholder="Sabor (ej. Sandía)"
              options={(flavors ?? []).map((f) => ({ value: f.name, label: f.name }))}
              allowCreate
              onCreate={async (name) => name.trim()}
            />
            <Input type="number" inputMode="decimal" min="0" placeholder="Precio (opcional)" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <Button size="sm" className="mt-2" loading={create.isPending}
            onClick={() => flavorName.trim() ? create.mutate() : toast.push("Escribe el sabor", "error")}>
            <Plus className="h-4 w-4" /> Agregar sabor
          </Button>
          <p className="mt-1.5 text-[11px] text-gray-400">SKU y unidad “Pieza” automáticos. El código de barras se agrega después escaneándolo.</p>
        </div>
      </div>
    </Dialog>
  );
}

// Edita el precio de venta (RETAIL) del sabor. Prefijado con el precio vigente.
function VariantPrice({ variant, onChanged }: { variant: Variant; onChanged: () => Promise<unknown> }) {
  const toast = useToast();
  const [price, setPrice] = useState(variant.price ?? "");

  const save = useMutation({
    mutationFn: () => api.post(`/pricing/variants/${variant.id}/price`, { price: Number(price) }),
    onSuccess: async () => { await onChanged(); toast.push("Precio actualizado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al guardar el precio", "error"),
  });

  const changed = price.trim() !== "" && price !== (variant.price ?? "");

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-gray-500">Precio de venta</p>
      <div className="flex items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
          <Input type="number" inputMode="decimal" min="0" className="w-36 pl-6" value={price}
            onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </div>
        <Button size="sm" loading={save.isPending} disabled={!changed}
          onClick={() => price.trim() ? save.mutate() : toast.push("Escribe un precio", "error")}>
          Guardar precio
        </Button>
      </div>
    </div>
  );
}

function VariantBarcodes({ variant, onChanged }: { variant: Variant; onChanged: () => Promise<unknown> }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [type, setType] = useState("EAN");
  const hasCodes = Boolean(variant.barcodes && variant.barcodes.length);

  const add = useMutation({
    mutationFn: () => api.post(`/variants/${variant.id}/barcodes`, { barcode: code.trim(), type, isPrimary: !hasCodes }),
    onSuccess: async () => { setCode(""); await onChanged(); toast.push("Código agregado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al guardar el código", "error"),
  });

  return (
    <div className="space-y-3">
      {hasCodes ? (
        <div className="flex flex-wrap gap-2">
          {variant.barcodes!.map((b, i) => (
            <span key={`${b.barcode}-${i}`} className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 font-mono text-xs">
              {b.barcode}<span className="text-[10px] uppercase text-gray-400">{b.type}</span>
            </span>
          ))}
        </div>
      ) : <p className="text-xs text-gray-400">Sin códigos de barras. Escanéalo con la cámara o tecléalo.</p>}

      <BarcodeScanner onScan={(c, fmt) => { setCode(c); setType(fmt); }} />

      <div className="flex gap-2">
        <Input placeholder="Código de barras" value={code} onChange={(e) => setCode(e.target.value)} />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="EAN">EAN</option>
          <option value="UPC">UPC</option>
          <option value="CODE128">CODE128</option>
          <option value="QR_INTERNAL">QR</option>
          <option value="OTHER">Otro</option>
        </Select>
        <Button size="sm" loading={add.isPending}
          onClick={() => code.trim() ? add.mutate() : toast.push("Escanea o teclea un código", "error")}>
          Guardar
        </Button>
      </div>
    </div>
  );
}
