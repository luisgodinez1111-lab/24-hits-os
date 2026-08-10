"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus } from "lucide-react";
import {
  Badge, Button, Card, CardBody, Dialog, EmptyState, FormField, Input, Select, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { Brand, Category, Flavor, ProductListItem, ProductPage, Unit, Variant } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

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
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nuevo producto
        </Button>
      </div>

      <Card className="mb-6">
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Buscar (nombre o SKU)">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hyper Bar…" />
          </FormField>
          <FormField label="Marca">
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">Todas</option>
              {brands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
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
      <VariantsDialog product={variantsFor} onClose={() => setVariantsFor(null)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["products"] })} />
    </div>
  );
}

function CreateProductDialog({ open, onClose, brands, onCreated }: {
  open: boolean; onClose: () => void; brands: Brand[]; onCreated: () => void;
}) {
  const toast = useToast();
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
          <Select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
            <option value="">Sin marca</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Categoría">
          <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Sin categoría</option>{categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
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
  const enabled = Boolean(product);
  const { data: detail, refetch } = useQuery({
    queryKey: ["product", product?.id],
    queryFn: () => api.get<{ variants: Variant[] }>(`/products/${product!.id}`),
    enabled,
  });
  const { data: units } = useQuery({ queryKey: ["units"], queryFn: () => api.get<Unit[]>("/units"), enabled });
  const { data: flavors } = useQuery({ queryKey: ["flavors"], queryFn: () => api.get<Flavor[]>("/flavors"), enabled });
  const [form, setForm] = useState({ sku: "", name: "", flavorId: "", unitId: "" });

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
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <span><span className="font-mono text-xs">{v.sku}</span> · {v.name}</span>
                {v.flavor?.name ? <Badge tone="brand">{v.flavor.name}</Badge> : null}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-400">Sin variantes.</p>}

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-2 text-xs font-semibold text-gray-600">Nueva variante</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <Input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select value={form.flavorId} onChange={(e) => setForm({ ...form, flavorId: e.target.value })}>
              <option value="">Sin sabor</option>{flavors?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <Select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
              <option value="">Unidad…</option>{units?.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
            </Select>
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
