"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, ChevronRight, Droplet, FolderTree, MoreHorizontal, Package, Search, Tag } from "lucide-react";
import {
  Badge, Button, Card, CardBody, Dialog, Dropdown, DropdownItem, EmptyState, Input, Skeleton, cn, useToast,
} from "@24hits/ui";
import type { Brand, Category, Flavor, ProductListItem, ProductPage, Variant } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { hasPermission, useMe } from "@/lib/me";

// --------------------------------------------------------------------------- helpers
const money = (v?: string | null) => (v != null ? `$${Number(v).toFixed(2)}` : "—");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
// "Dado de baja" = INACTIVE o DISCONTINUED (los DRAFT no cuentan como baja).
const isDown = (s: string) => s === "INACTIVE" || s === "DISCONTINUED";

type StatusFilter = "all" | "active" | "inactive";

// Contexto del árbol: estado de expansión, permisos y refresco. Se pasa hacia abajo
// para no repetir hooks ni prop-drilling desordenado.
type TreeCtx = {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  openNode: (id: string) => void;
  perms: { brand: boolean; createModel: boolean; editProduct: boolean };
  refreshTree: () => Promise<void>;
};

// =========================================================================== page
export default function AttributesPage() {
  const { data: me, isLoading } = useMe();
  const can = (p: Parameters<typeof hasPermission>[1]) => isLoading || hasPermission(me, p);
  const canAnyDict = can("brands.read") || can("categories.read") || can("flavors.read");

  return (
    <div className="space-y-6">
      {can("brands.read") && <CatalogTree />}

      {/* Listas maestras: reutilizables entre modelos. Secundario → detrás de un disclosure. */}
      {canAnyDict && (
        <details className="group rounded-xl border border-gray-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-700 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-90" />
            Listas maestras
            <span className="font-normal text-gray-400">· marcas, categorías y sabores reutilizables</span>
          </summary>
          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 p-4 lg:grid-cols-3">
            {can("brands.read") && (
              <AttrPanel<Brand>
                title="Marcas" icon={<Tag className="h-4 w-4 text-gray-400" />} endpoint="/brands" queryKey="brands" placeholder="Nueva marca"
                meta={(b) => <Badge tone={b.status === "ACTIVE" ? "green" : "gray"}>{b.status === "ACTIVE" ? "Activa" : "Inactiva"}</Badge>}
              />
            )}
            {can("categories.read") && (
              <AttrPanel<Category>
                title="Categorías" icon={<FolderTree className="h-4 w-4 text-gray-400" />} endpoint="/categories" queryKey="categories" placeholder="Nueva categoría"
                meta={(c) => <span className="font-mono text-[10px] text-gray-400">{c.slug}</span>}
              />
            )}
            {can("flavors.read") && (
              <AttrPanel<Flavor>
                title="Sabores" icon={<Droplet className="h-4 w-4 text-gray-400" />} endpoint="/flavors" queryKey="flavors" placeholder="Nuevo sabor"
              />
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// =========================================================================== tree
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

type BrandNodeData = { id: string; name: string; status: Brand["status"]; models: ProductListItem[] };

function CatalogTree() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const perms = {
    brand: hasPermission(me, "brands.manage"),
    createModel: hasPermission(me, "products.create"),
    editProduct: hasPermission(me, "products.update"),
  };

  const { data: brands, isLoading: lb } = useQuery({ queryKey: ["brands"], queryFn: () => api.get<Brand[]>("/brands") });
  const { data: products, isLoading: lp } = useQuery({ queryKey: ["products", "tree"], queryFn: fetchAllProducts });
  const loading = lb || lp;

  const byBrand = useMemo(() => {
    const map = new Map<string, ProductListItem[]>();
    for (const p of products ?? []) {
      const key = p.brand?.id ?? "__none__";
      (map.get(key) ?? map.set(key, []).get(key)!).push(p);
    }
    return map;
  }, [products]);

  const allNodes = useMemo<BrandNodeData[]>(() => {
    const list: BrandNodeData[] = (brands ?? [])
      .map((b) => ({ id: b.id, name: b.name, status: b.status, models: byBrand.get(b.id) ?? [] }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const noBrand = byBrand.get("__none__");
    if (noBrand?.length) list.push({ id: "__none__", name: "Sin marca", status: "ACTIVE", models: noBrand });
    return list;
  }, [brands, byBrand]);

  // ------- búsqueda + filtro de estado
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const filtering = searching || status !== "all";

  const nodes = useMemo(() => {
    const passModel = (s: string) => status === "all" || (status === "active" ? !isDown(s) : isDown(s));
    const passBrand = (s: string) => status === "all" || (status === "active" ? s === "ACTIVE" : s === "INACTIVE");
    return allNodes
      .map((node) => {
        const brandMatch = !q || node.name.toLowerCase().includes(q);
        const models = node.models.filter((m) => passModel(m.status) && (brandMatch || m.name.toLowerCase().includes(q)));
        return { ...node, models, keep: models.length > 0 || (brandMatch && passBrand(node.status)) };
      })
      .filter((n) => n.keep);
  }, [allNodes, q, status]);

  const shownModels = nodes.reduce((n, b) => n + b.models.length, 0);

  // ------- expansión
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const openNode = (id: string) => setOpen((prev) => new Set(prev).add(id));
  const anyOpen = nodes.some((n) => open.has(n.id));
  const toggleAll = () => setOpen(anyOpen ? new Set() : new Set(nodes.map((n) => n.id)));

  const ctx: TreeCtx = {
    isOpen: (id) => open.has(id),
    toggle,
    openNode,
    perms,
    refreshTree: async () => {
      await qc.invalidateQueries({ queryKey: ["products", "tree"] });
      await qc.invalidateQueries({ queryKey: ["brands"] });
    },
  };

  // ------- alta de marca
  const [newBrand, setNewBrand] = useState("");
  const createBrand = useMutation({
    mutationFn: (name: string) => api.post("/brands", { name }),
    onSuccess: async () => {
      setNewBrand("");
      await qc.invalidateQueries({ queryKey: ["brands"] });
      toast.push("Marca creada", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al crear la marca", "error"),
  });

  return (
    <Card>
      {/* encabezado + controles */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-900">Marca · Modelo · Sabor</span>
          <Link href="/app/catalog/products" className="ml-auto text-xs font-medium text-brand hover:underline">
            Vista de modelos →
          </Link>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="h-9 pl-9"
              placeholder="Buscar marca o modelo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar en el catálogo"
            />
          </div>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "Todos" },
              { value: "active", label: "Activos" },
              { value: "inactive", label: "De baja" },
            ]}
          />
          {nodes.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              {anyOpen ? "Colapsar todo" : "Expandir todo"}
            </button>
          )}
        </div>
      </div>

      <CardBody className="p-2 sm:p-3">
        {loading ? (
          <SkeletonRows />
        ) : allNodes.length === 0 ? (
          <EmptyState
            icon={<Tag className="mx-auto h-8 w-8 text-gray-300" />}
            title="Tu catálogo está vacío"
            description="Crea tu primera marca abajo y agrégale modelos y sabores."
          />
        ) : nodes.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-gray-400">
            Nada coincide con {searching ? <>“{query}”</> : "el filtro"}.
          </p>
        ) : (
          <>
            <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {filtering
                ? `Mostrando ${plural(nodes.length, "marca", "marcas")} · ${plural(shownModels, "modelo", "modelos")}`
                : `${plural(allNodes.length, "marca", "marcas")} · ${plural(products?.length ?? 0, "modelo", "modelos")}`}
            </p>
            <ul role="tree" aria-label="Catálogo por marca">
              {nodes.map((node) => (
                <BrandNode key={node.id} node={node} ctx={ctx} forceOpen={searching} />
              ))}
            </ul>
          </>
        )}

        {perms.brand && !loading && (
          <div className="mt-1 border-t border-gray-100 pt-2">
            <AddRow
              icon={<Tag className="h-3.5 w-3.5" />}
              placeholder="Agregar marca…"
              pending={createBrand.isPending}
              value={newBrand}
              onValue={setNewBrand}
              onSubmit={(name) => createBrand.mutate(name)}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// =========================================================================== rows
// Fila canónica: misma geometría (h-11) e indentación en los tres niveles.
function RowShell({
  expandable, isOpen, onToggle, icon, title, titleClass, chip, trailing, menu,
}: {
  expandable: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  icon: ReactNode;
  title: string;
  titleClass: string;
  chip?: ReactNode;
  trailing?: ReactNode;
  menu?: ReactNode;
}) {
  const content = (
    <>
      {expandable ? (
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", isOpen && "rotate-90")} />
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      {icon}
      <span className={cn("truncate", titleClass)}>{title}</span>
      {chip}
    </>
  );
  return (
    <div className="group flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-gray-50">
      {expandable ? (
        <button type="button" onClick={onToggle} aria-expanded={isOpen} className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg pl-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1">
          {content}
        </button>
      ) : (
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 pl-2">{content}</div>
      )}
      {trailing ? <div className="flex shrink-0 items-center gap-2.5">{trailing}</div> : null}
      {menu}
    </div>
  );
}

// Menú de acciones táctil (reutiliza Dropdown: outside-click + Esc ya resueltos).
function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Dropdown
      align="right"
      trigger={
        <span className="flex h-9 w-9 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">{label}</span>
        </span>
      }
    >
      {children}
    </Dropdown>
  );
}

// Fila de "agregar" — deliberadamente distinta de las filas de datos (ícono + tenue).
function AddRow({
  icon, placeholder, pending, onSubmit, withPrice, value, onValue,
}: {
  icon: ReactNode;
  placeholder: string;
  pending: boolean;
  onSubmit: (name: string, price?: number) => void;
  withPrice?: boolean;
  value?: string;
  onValue?: (v: string) => void;
}) {
  const toast = useToast();
  const [local, setLocal] = useState("");
  const [price, setPrice] = useState("");
  const name = value ?? local;
  const setName = onValue ?? setLocal;
  return (
    <form
      className="flex items-center gap-2 py-0.5 pl-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return toast.push("Escribe un nombre", "error");
        onSubmit(name.trim(), withPrice && price.trim() ? Number(price) : undefined);
        setName("");
        setPrice("");
      }}
    >
      <span className="flex h-9 w-5 shrink-0 items-center justify-center text-gray-300">{icon}</span>
      <Input className="h-9 flex-1" placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      {withPrice && (
        <Input className="h-9 w-24" type="number" inputMode="decimal" min="0" placeholder="$ opc." value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Precio (opcional)" />
      )}
      <Button variant="secondary" size="sm" type="submit" loading={pending}>Agregar</Button>
    </form>
  );
}

function BrandNode({ node, ctx, forceOpen }: { node: BrandNodeData; ctx: TreeCtx; forceOpen: boolean }) {
  const isReal = node.id !== "__none__";
  const isOpen = ctx.isOpen(node.id) || forceOpen;
  const inactive = node.status === "INACTIVE";
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const setStatus = useMutation({
    mutationFn: (s: "ACTIVE" | "INACTIVE") => api.patch(`/brands/${node.id}`, { status: s }),
    onSuccess: async (_r, s) => { await ctx.refreshTree(); toast.push(s === "INACTIVE" ? "Marca dada de baja" : "Marca reactivada", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  const del = useMutation({
    mutationFn: () => api.del<{ unlinkedModels: number }>(`/brands/${node.id}`),
    onSuccess: async (res) => { setConfirming(false); await ctx.refreshTree(); toast.push(res.unlinkedModels ? `Marca eliminada · ${plural(res.unlinkedModels, "modelo", "modelos")} sin marca` : "Marca eliminada", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al eliminar", "error"),
  });
  const createModel = useMutation({
    mutationFn: (name: string) => api.post("/products", { name, brandId: isReal ? node.id : undefined, status: "ACTIVE" }),
    onSuccess: async () => { ctx.openNode(node.id); await ctx.refreshTree(); toast.push("Modelo creado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al crear el modelo", "error"),
  });

  return (
    <li role="treeitem" aria-level={1} aria-expanded={isOpen}>
      <RowShell
        expandable
        isOpen={isOpen}
        onToggle={() => ctx.toggle(node.id)}
        icon={<Tag className="h-4 w-4 shrink-0 text-gray-400" />}
        title={node.name}
        titleClass={cn("text-[15px] font-semibold", inactive ? "text-gray-400" : "text-gray-900")}
        chip={inactive ? <Badge tone="gray">Inactiva</Badge> : null}
        trailing={<span className="text-xs text-gray-400 tabular-nums">{plural(node.models.length, "modelo", "modelos")}</span>}
        menu={
          isReal && ctx.perms.brand ? (
            <RowMenu label={`Acciones de ${node.name}`}>
              {ctx.perms.createModel && <DropdownItem onClick={() => ctx.openNode(node.id)}>Agregar modelo</DropdownItem>}
              <DropdownItem onClick={() => setStatus.mutate(inactive ? "ACTIVE" : "INACTIVE")}>{inactive ? "Reactivar" : "Dar de baja"}</DropdownItem>
              <DropdownItem onClick={() => setConfirming(true)}><span className="text-red-600">Eliminar marca…</span></DropdownItem>
            </RowMenu>
          ) : null
        }
      />
      {isOpen && (
        <ul role="group" className="ml-3.5 border-l border-gray-100 pl-2 motion-safe:animate-slide-down">
          {node.models.length ? (
            node.models.map((m) => <ModelNode key={m.id} model={m} ctx={ctx} />)
          ) : (
            <li className="px-2 py-2 text-xs text-gray-400">Sin modelos.</li>
          )}
          {ctx.perms.createModel && (
            <li>
              <AddRow icon={<Package className="h-3.5 w-3.5" />} placeholder="Agregar modelo…" pending={createModel.isPending} onSubmit={(name) => createModel.mutate(name)} />
            </li>
          )}
        </ul>
      )}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Eliminar marca"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button variant="danger" size="sm" loading={del.isPending} onClick={() => del.mutate()}>Eliminar marca</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Se eliminará la marca <b>{node.name}</b>.{" "}
          {node.models.length > 0
            ? `Sus ${plural(node.models.length, "modelo", "modelos")} no se borran: quedarán como “Sin marca”.`
            : "No tiene modelos."}
        </p>
      </Dialog>
    </li>
  );
}

function ModelNode({ model, ctx }: { model: ProductListItem; ctx: TreeCtx }) {
  const isOpen = ctx.isOpen(model.id);
  const inactive = model.status !== "ACTIVE";
  const qc = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["product", model.id],
    queryFn: () => api.get<{ variants: Variant[] }>(`/products/${model.id}`),
    enabled: isOpen,
  });
  const refresh = async () => { await refetch(); await ctx.refreshTree(); };

  const addSabor = useMutation({
    mutationFn: (v: { name: string; price?: number }) => api.post(`/products/${model.id}/variants`, { flavorName: v.name, name: v.name, ...(v.price != null ? { price: v.price } : {}) }),
    onSuccess: async () => { await refresh(); void qc.invalidateQueries({ queryKey: ["flavors"] }); toast.push("Sabor agregado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al agregar", "error"),
  });
  const setStatus = useMutation({
    mutationFn: (s: "ACTIVE" | "INACTIVE") => api.patch(`/products/${model.id}`, { status: s }),
    onSuccess: async (_r, s) => { await ctx.refreshTree(); toast.push(s === "INACTIVE" ? "Modelo dado de baja" : "Modelo reactivado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  const del = useMutation({
    mutationFn: () => api.del<{ deleted: boolean; deactivated: boolean; reason?: string }>(`/products/${model.id}`),
    onSuccess: async (res) => { setConfirming(false); await ctx.refreshTree(); toast.push(res.deactivated ? res.reason ?? "Modelo desactivado (tiene historial)" : "Modelo eliminado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al eliminar", "error"),
  });

  const variants = data?.variants ?? [];

  return (
    <li role="treeitem" aria-level={2} aria-expanded={isOpen}>
      <RowShell
        expandable
        isOpen={isOpen}
        onToggle={() => ctx.toggle(model.id)}
        icon={<Package className="h-4 w-4 shrink-0 text-gray-400" />}
        title={model.name}
        titleClass={cn("text-sm font-medium", inactive ? "text-gray-400" : "text-gray-800")}
        chip={inactive ? <Badge tone="gray">Inactivo</Badge> : null}
        trailing={<span className="text-xs text-gray-400 tabular-nums">{plural(model._count.variants, "sabor", "sabores")}</span>}
        menu={
          ctx.perms.editProduct ? (
            <RowMenu label={`Acciones de ${model.name}`}>
              <DropdownItem onClick={() => ctx.openNode(model.id)}>Agregar sabor</DropdownItem>
              <DropdownItem onClick={() => setStatus.mutate(inactive ? "ACTIVE" : "INACTIVE")}>{inactive ? "Reactivar" : "Dar de baja"}</DropdownItem>
              <DropdownItem onClick={() => setConfirming(true)}><span className="text-red-600">Eliminar modelo…</span></DropdownItem>
            </RowMenu>
          ) : null
        }
      />
      {isOpen && (
        <ul role="group" className="ml-3.5 border-l border-gray-100 pl-2 motion-safe:animate-slide-down">
          {isLoading ? (
            <li className="px-2 py-1"><Skeleton className="h-4 w-40" /></li>
          ) : (
            <>
              {variants.length ? (
                variants.map((v) => <SaborRow key={v.id} variant={v} canEdit={ctx.perms.editProduct} onChanged={refresh} />)
              ) : (
                <li className="px-2 py-2 text-xs text-gray-400">Sin sabores.</li>
              )}
              {ctx.perms.editProduct && (
                <li>
                  <AddRow icon={<Droplet className="h-3.5 w-3.5" />} placeholder="Agregar sabor…" withPrice pending={addSabor.isPending} onSubmit={(name, price) => addSabor.mutate({ name, price })} />
                </li>
              )}
            </>
          )}
        </ul>
      )}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Eliminar modelo"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button variant="danger" size="sm" loading={del.isPending} onClick={() => del.mutate()}>Eliminar modelo</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Se eliminará el modelo <b>{model.name}</b> y sus sabores. Si ya tiene ventas o movimientos de inventario, se
          <b> desactivará</b> en lugar de borrarse (para conservar el historial).
        </p>
      </Dialog>
    </li>
  );
}

function SaborRow({ variant, canEdit, onChanged }: { variant: Variant; canEdit: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const inactive = variant.status !== "ACTIVE";
  const [confirming, setConfirming] = useState(false);
  const bc = variant.barcodes?.length ?? 0;

  const setStatus = useMutation({
    mutationFn: (s: "ACTIVE" | "INACTIVE") => api.patch(`/variants/${variant.id}`, { status: s }),
    onSuccess: async (_r, s) => { await onChanged(); toast.push(s === "INACTIVE" ? "Sabor dado de baja" : "Sabor reactivado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  const del = useMutation({
    mutationFn: () => api.del<{ deleted: boolean; deactivated: boolean; reason?: string }>(`/variants/${variant.id}`),
    onSuccess: async (res) => { setConfirming(false); await onChanged(); toast.push(res.deactivated ? res.reason ?? "Sabor desactivado (tiene historial)" : "Sabor eliminado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al eliminar", "error"),
  });

  return (
    <li role="treeitem" aria-level={3}>
      <RowShell
        expandable={false}
        icon={<Droplet className="h-4 w-4 shrink-0 text-gray-400" />}
        title={variant.flavor?.name ?? variant.name}
        titleClass={cn("text-sm", inactive ? "text-gray-400" : "text-gray-700")}
        chip={inactive ? <Badge tone="gray">Inactivo</Badge> : null}
        trailing={
          <>
            {bc > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-gray-400 tabular-nums" title={plural(bc, "código de barras", "códigos de barras")}>
                <Barcode className="h-3 w-3" />
                {bc}
              </span>
            )}
            <span className="font-mono text-sm font-semibold text-gray-900 tabular-nums">{money(variant.price)}</span>
          </>
        }
        menu={
          canEdit ? (
            <RowMenu label={`Acciones de ${variant.flavor?.name ?? variant.name}`}>
              <DropdownItem onClick={() => setStatus.mutate(inactive ? "ACTIVE" : "INACTIVE")}>{inactive ? "Reactivar" : "Dar de baja"}</DropdownItem>
              <DropdownItem onClick={() => setConfirming(true)}><span className="text-red-600">Eliminar sabor…</span></DropdownItem>
            </RowMenu>
          ) : null
        }
      />
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Eliminar sabor"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button variant="danger" size="sm" loading={del.isPending} onClick={() => del.mutate()}>Eliminar sabor</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Se eliminará el sabor <b>{variant.flavor?.name ?? variant.name}</b>. Si ya tiene ventas o movimientos, se
          <b> desactivará</b> en lugar de borrarse.
        </p>
      </Dialog>
    </li>
  );
}

// =========================================================================== controls
function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg bg-gray-100 p-0.5" role="tablist" aria-label="Filtrar por estado">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SkeletonRows() {
  const widths = ["w-40", "w-28", "w-52", "w-32", "w-44"];
  return (
    <div className="space-y-0.5">
      {widths.map((w, i) => (
        <div key={i} className="flex h-11 items-center gap-2 px-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className={cn("h-4 rounded", w)} />
          <Skeleton className="ml-auto h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

// =========================================================================== dictionaries (avanzado)
function AttrPanel<T extends { id: string; name: string }>({
  title, icon, endpoint, queryKey, placeholder, meta,
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
    onSuccess: async () => { setName(""); await qc.invalidateQueries({ queryKey: [queryKey] }); toast.push("Agregado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div className="rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
        {icon}
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        <span className="ml-auto text-xs text-gray-400 tabular-nums">{data?.length ?? 0}</span>
      </div>
      <div className="space-y-3 p-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
          <Input className="h-9" placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" type="submit" loading={create.isPending}>Agregar</Button>
        </form>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Sin {title.toLowerCase()}.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
            {data.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate font-medium text-gray-800">{item.name}</span>
                {meta && <span className="shrink-0">{meta(item)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
