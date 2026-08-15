"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, ChevronDown, Package, Plus, ScanLine } from "lucide-react";
import {
  Badge, Button, Card, CardBody, Combobox, Dialog, EmptyState, FormField, Input, Select, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { Brand, Category, Flavor, ProductListItem, ProductPage, Unit, Variant } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { QuickRegisterDialog } from "@/components/QuickRegisterDialog";

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
  const [variantsFor, setVariantsFor] = useState<ProductListItem | null>(null);

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="text-sm text-gray-500">Catálogo de productos y variantes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setQuickOpen(true)}>
            <ScanLine className="h-4 w-4" /> Alta por escaneo
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nuevo producto
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Buscar (nombre o SKU)">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hyper Bar…" />
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
        <Skeleton className="h-64 w-full" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<Package className="h-8 w-8 text-gray-400" />} title="Sin productos" description="Crea el primero." />
      ) : (
        <Table>
          <THead>
            <TR><TH>Producto</TH><TH>Marca</TH><TH>Categoría</TH><TH className="text-right">Variantes</TH><TH>Estado</TH><TH>{" "}</TH></TR>
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
                  <Button size="sm" variant="outline" onClick={() => setVariantsFor(p)}>Variantes</Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CreateProductDialog open={creating} onClose={() => setCreating(false)} brands={brands ?? []}
        onCreated={async () => { setCreating(false); await qc.invalidateQueries({ queryKey: ["products"] }); toast.push("Producto creado", "success"); }} />
      <QuickRegisterDialog open={quickOpen} onClose={() => setQuickOpen(false)}
        onRegistered={async () => { await qc.invalidateQueries({ queryKey: ["products"] }); }} />
      <VariantsDialog product={variantsFor} onClose={() => setVariantsFor(null)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["products"] })} />
    </div>
  );
}

function CreateProductDialog({ open, onClose, brands, onCreated }: {
  open: boolean; onClose: () => void; brands: Brand[]; onCreated: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });
  const [form, setForm] = useState({ name: "", brandId: "", categoryId: "", status: "DRAFT" });
  const create = useMutation({
    mutationFn: () => api.post("/products", {
      name: form.name, brandId: form.brandId || undefined, categoryId: form.categoryId || undefined, status: form.status,
    }),
    onSuccess: () => { setForm({ name: "", brandId: "", categoryId: "", status: "DRAFT" }); onCreated(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Nuevo producto"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={create.isPending} onClick={() => form.name.trim() && create.mutate()}>Crear</Button></>}>
      <div className="space-y-3">
        <FormField label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
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
        <FormField label="Categoría">
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
            <option value="DRAFT">Borrador</option><option value="ACTIVE">Activo</option>
          </Select>
        </FormField>
      </div>
    </Dialog>
  );
}

function VariantsDialog({ product, onClose, onChanged }: {
  product: ProductListItem | null; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const enabled = Boolean(product);
  const { data: detail, refetch } = useQuery({
    queryKey: ["product", product?.id],
    queryFn: () => api.get<{ variants: Variant[] }>(`/products/${product!.id}`),
    enabled,
  });
  const { data: units } = useQuery({ queryKey: ["units"], queryFn: () => api.get<Unit[]>("/units"), enabled });
  const { data: flavors } = useQuery({ queryKey: ["flavors"], queryFn: () => api.get<Flavor[]>("/flavors"), enabled });
  const [form, setForm] = useState({ sku: "", name: "", flavorId: "", unitId: "" });
  const [expanded, setExpanded] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post(`/products/${product!.id}/variants`, {
      sku: form.sku, name: form.name, flavorId: form.flavorId || undefined,
      purchaseUnitId: form.unitId, salesUnitId: form.unitId,
    }),
    onSuccess: async () => { setForm({ sku: "", name: "", flavorId: "", unitId: "" }); await refetch(); onChanged(); toast.push("Variante creada", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <Dialog open={enabled} onClose={onClose} title={`Variantes — ${product?.name ?? ""}`}>
      <div className="space-y-3">
        {detail?.variants?.length ? (
          <div className="space-y-1">
            {detail.variants.map((v) => (
              <div key={v.id} className="rounded-lg border border-gray-200">
                <button type="button" onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <span><span className="font-mono text-xs">{v.sku}</span> · {v.name}</span>
                  <span className="flex items-center gap-2">
                    {v.flavor?.name ? <Badge tone="brand">{v.flavor.name}</Badge> : null}
                    <Badge tone={v.barcodes && v.barcodes.length ? "green" : "gray"}>
                      <Barcode className="mr-1 inline h-3 w-3" />{v.barcodes?.length ?? 0}
                    </Badge>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded === v.id ? "rotate-180" : ""}`} />
                  </span>
                </button>
                {expanded === v.id && (
                  <div className="border-t border-gray-100 px-3 py-3">
                    <VariantBarcodes variant={v} onChanged={refetch} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-400">Sin variantes.</p>}

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-2 text-xs font-semibold text-gray-600">Nueva variante</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <Input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Combobox
              value={form.flavorId}
              onChange={(v) => setForm({ ...form, flavorId: v })}
              placeholder="Sin sabor"
              options={[{ value: "", label: "Sin sabor" }, ...(flavors ?? []).map((f) => ({ value: f.id, label: f.name }))]}
              allowCreate
              onCreate={async (name) => {
                const f = await api.post<Flavor>("/flavors", { name });
                await qc.invalidateQueries({ queryKey: ["flavors"] });
                return f.id;
              }}
            />
            <Combobox
              value={form.unitId}
              onChange={(v) => setForm({ ...form, unitId: v })}
              placeholder="Unidad…"
              options={(units ?? []).map((u) => ({ value: u.id, label: u.code }))}
              allowCreate
              onCreate={async (code) => {
                const u = await api.post<Unit>("/units", { code: code.toUpperCase().slice(0, 20), name: code });
                await qc.invalidateQueries({ queryKey: ["units"] });
                return u.id;
              }}
            />
          </div>
          <Button size="sm" className="mt-2" loading={create.isPending}
            onClick={() => form.sku && form.name && form.unitId ? create.mutate() : toast.push("SKU, nombre y unidad requeridos", "error")}>
            Agregar variante
          </Button>
        </div>
      </div>
    </Dialog>
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
