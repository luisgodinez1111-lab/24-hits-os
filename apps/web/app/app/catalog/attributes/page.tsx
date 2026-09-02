"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Droplet, FolderTree, Package, Plus, Tag, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardBody, Input, Skeleton, useToast } from "@24hits/ui";
import type { Brand, Category, Flavor, ProductListItem, ProductPage, Variant } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { hasPermission, useMe } from "@/lib/me";

// Precio "$180.00" o "—".
const money = (v?: string | null) => (v != null ? `$${Number(v).toFixed(2)}` : "—");

export default function AttributesPage() {
  const { data: me, isLoading } = useMe();
  const can = (p: Parameters<typeof hasPermission>[1]) => isLoading || hasPermission(me, p);

  return (
    <div className="space-y-6">
      {/* Vista jerárquica del catálogo: Marca → Modelo → Sabor (lo que se vende). */}
      {can("brands.read") && <CatalogTree />}

      {/* Diccionarios: listas maestras reutilizables. Marcas y sabores se comparten
          entre modelos; las categorías clasifican. Cada panel según permiso. */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Diccionarios</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {can("brands.read") && (
            <AttrPanel<Brand>
              title="Marcas"
              icon={<Tag className="h-4 w-4 text-gray-500" />}
              endpoint="/brands"
              queryKey="brands"
              placeholder="Nueva marca"
              meta={(b) => <Badge tone={b.status === "ACTIVE" ? "green" : "gray"}>{b.status === "ACTIVE" ? "Activa" : "Inactiva"}</Badge>}
            />
          )}
          {can("categories.read") && (
            <AttrPanel<Category>
              title="Categorías"
              icon={<FolderTree className="h-4 w-4 text-gray-500" />}
              endpoint="/categories"
              queryKey="categories"
              placeholder="Nueva categoría"
              meta={(c) => <span className="font-mono text-[10px] text-gray-400">{c.slug}</span>}
            />
          )}
          {can("flavors.read") && (
            <AttrPanel<Flavor>
              title="Sabores"
              icon={<Droplet className="h-4 w-4 text-gray-500" />}
              endpoint="/flavors"
              queryKey="flavors"
              placeholder="Nuevo sabor"
            />
          )}
        </div>
      </section>
    </div>
  );
}

// Trae TODOS los modelos paginando (el catálogo de una tienda es modesto). Se agrupan
// por marca en el cliente, lo que además cubre los modelos "Sin marca" (la API no
// filtra brandId=null). Tope de seguridad por si el cursor no termina.
async function fetchAllProducts(): Promise<ProductListItem[]> {
  const items: ProductListItem[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const page = await api.get<ProductPage>(`/products?${qs.toString()}`);
    items.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return items;
}

// id "__none__" es el grupo sintético "Sin marca" (no es una marca real → sin acciones).
type BrandNodeData = { id: string; name: string; status: Brand["status"]; models: ProductListItem[] };

// Árbol Marca ▸ Modelo ▸ Sabor. Los sabores se cargan al expandir cada modelo
// (GET /products/:id). Es una vista de lectura; la edición vive en “Modelos”.
function CatalogTree() {
  const { data: brands, isLoading: loadingBrands } = useQuery({ queryKey: ["brands"], queryFn: () => api.get<Brand[]>("/brands") });
  const { data: products, isLoading: loadingProducts } = useQuery({ queryKey: ["products", "tree"], queryFn: fetchAllProducts });
  const loading = loadingBrands || loadingProducts;

  // Modelos agrupados por marca (clave "__none__" para los que no tienen marca).
  const byBrand = useMemo(() => {
    const map = new Map<string, ProductListItem[]>();
    for (const p of products ?? []) {
      const key = p.brand?.id ?? "__none__";
      const bucket = map.get(key);
      if (bucket) bucket.push(p);
      else map.set(key, [p]);
    }
    return map;
  }, [products]);

  // Nodos de marca: todas las marcas (aunque no tengan modelos) + “Sin marca” al final.
  const brandNodes = useMemo<BrandNodeData[]>(() => {
    const list: BrandNodeData[] = (brands ?? [])
      .map((b) => ({ id: b.id, name: b.name, status: b.status, models: byBrand.get(b.id) ?? [] }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const noBrand = byBrand.get("__none__");
    if (noBrand?.length) list.push({ id: "__none__", name: "Sin marca", status: "ACTIVE", models: noBrand });
    return list;
  }, [brands, byBrand]);

  const totalModels = products?.length ?? 0;

  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Alta de marca (al pie del árbol).
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canManageBrand = hasPermission(me, "brands.manage");
  const [newBrand, setNewBrand] = useState("");
  const createBrand = useMutation({
    mutationFn: () => api.post("/brands", { name: newBrand.trim() }),
    onSuccess: async () => {
      setNewBrand("");
      await qc.invalidateQueries({ queryKey: ["brands"] });
      toast.push("Marca creada", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al crear la marca", "error"),
  });

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <Tag className="h-4 w-4 text-gray-500" />
        <div>
          <span className="text-sm font-semibold">Catálogo</span>
          <p className="text-[11px] text-gray-400">Marca → modelo → sabor</p>
        </div>
        <a href="/app/catalog/products" className="ml-auto text-xs font-medium text-brand hover:underline">
          Editar en Modelos →
        </a>
      </div>
      <CardBody>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : brandNodes.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Aún no hay marcas ni modelos.</p>
        ) : (
          <>
            <p className="mb-2 text-[11px] text-gray-400">
              {brandNodes.length} marca(s) · {totalModels} modelo(s)
            </p>
            <ul className="space-y-0.5">
              {brandNodes.map((node) => (
                <BrandNode key={node.id} node={node} open={open} toggle={toggle} />
              ))}
            </ul>

            {canManageBrand && (
              <form
                className="mt-2 flex items-center gap-1.5 border-t border-gray-100 px-2 pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newBrand.trim()) createBrand.mutate();
                  else toast.push("Escribe el nombre de la marca", "error");
                }}
              >
                <Tag className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <Input className="h-8 flex-1 text-sm" placeholder="Nueva marca (ej. Elfbar)" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
                <Button size="sm" type="submit" loading={createBrand.isPending}>
                  <Plus className="h-4 w-4" /> Marca
                </Button>
              </form>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function BrandNode({ node, open, toggle }: { node: BrandNodeData; open: Set<string>; toggle: (id: string) => void }) {
  const isOpen = open.has(node.id);
  const isReal = node.id !== "__none__"; // "Sin marca" no es una marca real
  const inactive = node.status === "INACTIVE";
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canManage = hasPermission(me, "brands.manage");

  const canCreateModel = hasPermission(me, "products.create");
  const [confirming, setConfirming] = useState(false);
  const [newModel, setNewModel] = useState("");

  const refreshBrands = async () => {
    await qc.invalidateQueries({ queryKey: ["brands"] });
    await qc.invalidateQueries({ queryKey: ["products", "tree"] });
  };

  // Dar de baja / reactivar la marca (borrado lógico reversible).
  const setStatus = useMutation({
    mutationFn: (status: "ACTIVE" | "INACTIVE") => api.patch(`/brands/${node.id}`, { status }),
    onSuccess: async (_res, status) => {
      await refreshBrands();
      toast.push(status === "INACTIVE" ? "Marca dada de baja" : "Marca reactivada", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  // Eliminar la marca (sus modelos quedan "sin marca", no se borran).
  const del = useMutation({
    mutationFn: () => api.del<{ deleted: boolean; unlinkedModels: number }>(`/brands/${node.id}`),
    onSuccess: async (res) => {
      setConfirming(false);
      await refreshBrands();
      toast.push(res.unlinkedModels ? `Marca eliminada · ${res.unlinkedModels} modelo(s) quedaron sin marca` : "Marca eliminada", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al eliminar", "error"),
  });

  // Alta de modelo dentro de esta marca (en "Sin marca" queda sin marca).
  const createModel = useMutation({
    mutationFn: () => api.post("/products", { name: newModel.trim(), brandId: isReal ? node.id : undefined, status: "ACTIVE" }),
    onSuccess: async () => {
      setNewModel("");
      await qc.invalidateQueries({ queryKey: ["products", "tree"] });
      toast.push("Modelo creado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al crear el modelo", "error"),
  });

  return (
    <li>
      <div className={`flex items-center gap-1 rounded-md pr-1 hover:bg-gray-50 ${inactive ? "opacity-60" : ""}`}>
        <button
          type="button"
          onClick={() => toggle(node.id)}
          className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
        >
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          <Tag className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="truncate font-semibold">{node.name}</span>
          {inactive && <Badge tone="gray">Inactiva</Badge>}
          <span className="ml-auto shrink-0 text-xs text-gray-400 tabular-nums">{node.models.length} modelo(s)</span>
        </button>
        {isReal && canManage &&
          (confirming ? (
            <span className="flex shrink-0 items-center gap-1.5 pr-1">
              <button type="button" onClick={() => del.mutate()} disabled={del.isPending} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
                {del.isPending ? "…" : "Eliminar"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setStatus.mutate(inactive ? "ACTIVE" : "INACTIVE")}
                disabled={setStatus.isPending}
                title={inactive ? "Reactivar marca" : "Dar de baja la marca"}
                className={`rounded px-2 py-1 text-xs font-medium disabled:opacity-50 ${inactive ? "text-brand hover:underline" : "text-gray-400 hover:text-red-600"}`}
              >
                {setStatus.isPending ? "…" : inactive ? "Reactivar" : "Dar de baja"}
              </button>
              <button type="button" onClick={() => setConfirming(true)} title="Eliminar marca" className="rounded p-1 text-gray-300 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
      </div>
      {isOpen && (
        <div className="ml-4 border-l border-gray-100 pl-3">
          {node.models.length ? (
            <ul>
              {node.models.map((model) => (
                <ModelNode key={model.id} model={model} open={open} toggle={toggle} />
              ))}
            </ul>
          ) : (
            <p className="py-1 text-xs text-gray-400">Aún no hay modelos.</p>
          )}
          {canCreateModel && (
            <form
              className="mt-1 flex items-center gap-1.5 py-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (newModel.trim()) createModel.mutate();
                else toast.push("Escribe el nombre del modelo", "error");
              }}
            >
              <Package className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <Input className="h-8 flex-1 text-sm" placeholder="Nuevo modelo (ej. BC5000)" value={newModel} onChange={(e) => setNewModel(e.target.value)} />
              <Button size="sm" type="submit" loading={createModel.isPending} title="Agregar modelo">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

function ModelNode({ model, open, toggle }: { model: ProductListItem; open: Set<string>; toggle: (id: string) => void }) {
  const isOpen = open.has(model.id);
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canEdit = hasPermission(me, "products.update");

  // Sabores del modelo: solo se piden cuando el nodo está expandido.
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["product", model.id],
    queryFn: () => api.get<{ variants: Variant[] }>(`/products/${model.id}`),
    enabled: isOpen,
  });

  // Tras agregar/eliminar: recarga los sabores del modelo y el árbol (para el conteo).
  const refresh = async () => {
    await refetch();
    await qc.invalidateQueries({ queryKey: ["products", "tree"] });
  };

  const [flavorName, setFlavorName] = useState("");
  const [price, setPrice] = useState("");
  const addSabor = useMutation({
    mutationFn: () =>
      api.post(`/products/${model.id}/variants`, {
        flavorName: flavorName.trim(),
        name: flavorName.trim(),
        ...(price.trim() ? { price: Number(price) } : {}),
      }),
    onSuccess: async () => {
      setFlavorName("");
      setPrice("");
      await refresh();
      void qc.invalidateQueries({ queryKey: ["flavors"] });
      toast.push("Sabor agregado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al agregar", "error"),
  });

  // Dar de baja / reactivar el modelo (status; reversible, conserva sabores e historial).
  const inactive = model.status !== "ACTIVE";
  const setModelStatus = useMutation({
    mutationFn: (status: "ACTIVE" | "INACTIVE") => api.patch(`/products/${model.id}`, { status }),
    onSuccess: async (_res, status) => {
      await qc.invalidateQueries({ queryKey: ["products", "tree"] });
      toast.push(status === "INACTIVE" ? "Modelo dado de baja" : "Modelo reactivado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  // Eliminar el modelo (borra si nunca se usó; si tiene historial, la API lo desactiva).
  const [confirming, setConfirming] = useState(false);
  const del = useMutation({
    mutationFn: () => api.del<{ deleted: boolean; deactivated: boolean; reason?: string }>(`/products/${model.id}`),
    onSuccess: async (res) => {
      setConfirming(false);
      await qc.invalidateQueries({ queryKey: ["products", "tree"] });
      toast.push(res.deactivated ? res.reason ?? "Modelo desactivado (tiene historial)" : "Modelo eliminado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al eliminar", "error"),
  });

  const variants = data?.variants ?? [];

  return (
    <li>
      <div className={`flex items-center gap-1 rounded-md pr-1 hover:bg-gray-50 ${inactive ? "opacity-60" : ""}`}>
        <button
          type="button"
          onClick={() => toggle(model.id)}
          className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
        >
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          <Package className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="truncate font-medium">{model.name}</span>
          {inactive && <Badge tone="gray">Inactivo</Badge>}
          <span className="ml-auto shrink-0 text-xs text-gray-400 tabular-nums">{model._count.variants} sabor(es)</span>
        </button>
        {canEdit &&
          (confirming ? (
            <span className="flex shrink-0 items-center gap-1.5 pr-1">
              <button type="button" onClick={() => del.mutate()} disabled={del.isPending} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
                {del.isPending ? "…" : "Eliminar"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setModelStatus.mutate(inactive ? "ACTIVE" : "INACTIVE")}
                disabled={setModelStatus.isPending}
                title={inactive ? "Reactivar modelo" : "Dar de baja el modelo"}
                className={`rounded px-2 py-1 text-xs font-medium disabled:opacity-50 ${inactive ? "text-brand hover:underline" : "text-gray-400 hover:text-red-600"}`}
              >
                {setModelStatus.isPending ? "…" : inactive ? "Reactivar" : "Dar de baja"}
              </button>
              <button type="button" onClick={() => setConfirming(true)} title="Eliminar modelo" className="rounded p-1 text-gray-300 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
      </div>
      {isOpen && (
        <div className="ml-4 border-l border-gray-100 pl-3">
          {isLoading ? (
            <Skeleton className="my-1 h-10 w-40" />
          ) : (
            <>
              {variants.length ? (
                <ul>
                  {variants.map((v) => (
                    <SaborRow key={v.id} variant={v} canEdit={canEdit} onChanged={refresh} />
                  ))}
                </ul>
              ) : (
                <p className="py-1 text-xs text-gray-400">Aún no hay sabores.</p>
              )}

              {/* Alta de sabor en línea (SKU y unidad se generan solos en la API). */}
              {canEdit && (
                <form
                  className="mt-1 flex items-center gap-1.5 py-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (flavorName.trim()) addSabor.mutate();
                    else toast.push("Escribe el sabor", "error");
                  }}
                >
                  <Input
                    className="h-8 flex-1 text-sm"
                    placeholder="Nuevo sabor (ej. Sandía)"
                    value={flavorName}
                    onChange={(e) => setFlavorName(e.target.value)}
                  />
                  <Input
                    className="h-8 w-24 text-sm"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="$ opc."
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                  <Button size="sm" type="submit" loading={addSabor.isPending} title="Agregar sabor">
                    <Plus className="h-4 w-4" />
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

// Fila de un sabor con eliminar. El borrado pide confirmación en línea (evita el
// confirm() del navegador). La API decide borrar vs desactivar según el historial.
function SaborRow({ variant, canEdit, onChanged }: { variant: Variant; canEdit: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const inactive = variant.status !== "ACTIVE";

  // Dar de baja / reactivar el sabor (reversible, conserva historial).
  const setStatus = useMutation({
    mutationFn: (status: "ACTIVE" | "INACTIVE") => api.patch(`/variants/${variant.id}`, { status }),
    onSuccess: async (_res, status) => {
      await onChanged();
      toast.push(status === "INACTIVE" ? "Sabor dado de baja" : "Sabor reactivado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  // Eliminar (borra si nunca se usó; la API desactiva si tiene historial).
  const del = useMutation({
    mutationFn: () => api.del<{ deleted: boolean; deactivated: boolean; reason?: string }>(`/variants/${variant.id}`),
    onSuccess: async (res) => {
      setConfirming(false);
      await onChanged();
      toast.push(res.deactivated ? res.reason ?? "Sabor desactivado (tiene historial)" : "Sabor eliminado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al eliminar", "error"),
  });

  return (
    <li className={`group flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-gray-50 ${inactive ? "opacity-60" : ""}`}>
      <Droplet className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      <span className="truncate">{variant.flavor?.name ?? variant.name}</span>
      {inactive && <Badge tone="gray">Inactivo</Badge>}
      <span className="ml-auto shrink-0 text-xs font-semibold text-gray-700 tabular-nums">{money(variant.price)}</span>
      <Badge tone={variant.barcodes && variant.barcodes.length ? "green" : "gray"}>{variant.barcodes?.length ?? 0} cb</Badge>
      {canEdit &&
        (confirming ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => del.mutate()} disabled={del.isPending} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
              {del.isPending ? "…" : "Eliminar"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
          </span>
        ) : (
          <span className={`flex shrink-0 items-center gap-2 ${inactive ? "" : "opacity-0 transition group-hover:opacity-100"}`}>
            <button
              type="button"
              onClick={() => setStatus.mutate(inactive ? "ACTIVE" : "INACTIVE")}
              disabled={setStatus.isPending}
              className={`text-xs font-medium disabled:opacity-50 ${inactive ? "text-brand hover:underline" : "text-gray-400 hover:text-red-600"}`}
            >
              {setStatus.isPending ? "…" : inactive ? "Reactivar" : "Dar de baja"}
            </button>
            {!inactive && (
              <button type="button" onClick={() => setConfirming(true)} title="Eliminar sabor" className="text-gray-300 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
    </li>
  );
}

// Panel genérico para una lista simple (nombre + creación en línea).
function AttrPanel<T extends { id: string; name: string }>({
  title,
  icon,
  endpoint,
  queryKey,
  placeholder,
  meta,
}: {
  title: string;
  icon: ReactNode;
  endpoint: string;
  queryKey: string;
  placeholder: string;
  meta?: (item: T) => ReactNode;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: () => api.get<T[]>(endpoint) });

  const create = useMutation({
    mutationFn: () => api.post(endpoint, { name: name.trim() }),
    onSuccess: async () => {
      setName("");
      await qc.invalidateQueries({ queryKey: [queryKey] });
      toast.push("Agregado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto text-xs text-gray-400 tabular-nums">{data?.length ?? 0}</span>
      </div>
      <CardBody className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" loading={create.isPending}>Agregar</Button>
        </form>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Sin {title.toLowerCase()}.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
            {data.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate font-medium">{item.name}</span>
                {meta && <span className="shrink-0">{meta(item)}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
