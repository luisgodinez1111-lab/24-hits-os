"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, PackagePlus, ShoppingCart, Truck } from "lucide-react";
import {
  Badge, Button, Card, CardBody, EmptyState, Input, PageHeader, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import { api, ApiError } from "@/lib/api";
import { hasPermission, useMe } from "@/lib/me";
import { downloadCsv, csvDateTag } from "@/lib/csv";

type Suggestion = {
  variantId: string; warehouseId: string; warehouseName: string | null;
  product: string | null; flavor: string | null; sku: string | null;
  available: number; reorderPoint: number; suggestedQty: number;
  supplierId: string | null; supplierName: string | null; unitCost: number | null;
};
type Group = { supplierId: string | null; supplierName: string | null; warehouseId: string; warehouseName: string | null; items: Suggestion[] };
const money = (v?: number | null) => (v != null ? `$${Number(v).toFixed(2)}` : "—");

// Reabastecer (0.5): qué comprar, cuánto y a quién, según el punto de reorden y el
// proveedor preferido de cada producto → crea la orden de compra en un clic. Reusa el
// saldo + la política de inventario + las referencias de proveedor que ya existen.
export default function ReorderPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const { data: me } = useMe();
  const canPurchase = hasPermission(me, "purchase.order.create");
  const { data, isLoading } = useQuery({ queryKey: ["reorder-suggestions"], queryFn: () => api.get<Suggestion[]>("/inventory/reorder-suggestions") });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [createdKeys, setCreatedKeys] = useState<Set<string>>(new Set());

  const rowKey = (s: Suggestion) => `${s.variantId}:${s.warehouseId}`;
  const gKey = (supplierId: string | null, warehouseId: string) => `${supplierId ?? "none"}:${warehouseId}`;

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>();
    for (const s of data ?? []) {
      const k = gKey(s.supplierId, s.warehouseId);
      if (createdKeys.has(k)) continue;
      let g = m.get(k);
      if (!g) { g = { supplierId: s.supplierId, supplierName: s.supplierName, warehouseId: s.warehouseId, warehouseName: s.warehouseName, items: [] }; m.set(k, g); }
      g.items.push(s);
    }
    return [...m.values()];
  }, [data, createdKeys]);

  const create = useMutation({
    mutationFn: (g: Group) => api.post("/purchase-orders", {
      supplierId: g.supplierId,
      warehouseId: g.warehouseId,
      items: g.items.map((s) => ({ variantId: s.variantId, orderedQuantity: qty[rowKey(s)] ?? s.suggestedQty, unitCost: s.unitCost ?? 0, taxRate: 0 })),
    }),
    onSuccess: (_r, g) => {
      setCreatedKeys((prev) => new Set(prev).add(gKey(g.supplierId, g.warehouseId)));
      toast.push("Orden de compra creada ✓", "success");
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "No se pudo crear la orden de compra", "error"),
  });
  const creatingKey = create.isPending && create.variables ? gKey(create.variables.supplierId, create.variables.warehouseId) : null;

  // Exporta las sugerencias (con la cantidad editada) para mandar al proveedor.
  function exportCsv() {
    const rows = (data ?? []).map((s) => [
      s.supplierName ?? "Sin proveedor",
      s.warehouseName ?? "",
      s.product ?? "",
      s.flavor ?? "",
      s.sku ?? "",
      s.available,
      s.reorderPoint,
      qty[rowKey(s)] ?? s.suggestedQty,
      s.unitCost ?? "",
    ]);
    downloadCsv(
      `sugerencias_compra_${csvDateTag()}`,
      ["Proveedor", "Almacén", "Producto", "Sabor", "SKU", "Disponible", "Punto de reorden", "Sugerido", "Costo unitario"],
      rows
    );
  }

  return (
    <div>
      <PageHeader
        title="Reabastecer"
        subtitle="Qué comprar, cuánto y a quién — según tu punto de reorden. Crea la orden de compra en un clic."
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/app/purchasing/orders")}>
              <ShoppingCart className="h-4 w-4" /> Órdenes de compra
            </Button>
            <Button variant="outline" disabled={!(data && data.length > 0)} onClick={exportCsv}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<PackagePlus className="h-8 w-8 text-gray-400" />}
          title="Todo con buen nivel"
          description="Ningún producto por debajo de su punto de reorden. Define puntos de reorden en Existencias para recibir sugerencias de compra."
          action={<Button variant="outline" onClick={() => router.push("/app/inventory?filter=low")}><Truck className="h-4 w-4" /> Ir a Existencias</Button>}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={gKey(g.supplierId, g.warehouseId)}>
              <CardBody>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4 text-gray-400" /> {g.supplierName ?? "Sin proveedor asignado"}</p>
                    <p className="text-xs text-gray-500">{g.warehouseName ?? "Almacén"} · {g.items.length} {g.items.length === 1 ? "producto" : "productos"}</p>
                  </div>
                  {g.supplierId && canPurchase ? (
                    <Button size="sm" loading={creatingKey === gKey(g.supplierId, g.warehouseId)} onClick={() => create.mutate(g)}>
                      <PackagePlus className="h-4 w-4" /> Crear orden de compra
                    </Button>
                  ) : !g.supplierId ? (
                    <Badge tone="amber">Asigna un proveedor para ordenar</Badge>
                  ) : null}
                </div>
                <Table>
                  <THead>
                    <TR><TH>Producto</TH><TH className="text-right">Disponible</TH><TH className="text-right">Reorden</TH><TH className="text-right">Sugerido</TH><TH className="text-right">Costo</TH></TR>
                  </THead>
                  <TBody>
                    {g.items.map((s) => (
                      <TR key={rowKey(s)}>
                        <TD>
                          <span className="font-medium">{s.flavor ?? s.product ?? s.sku}</span>
                          <span className="block text-xs text-gray-400">{s.product ?? ""}{s.sku ? ` · ${s.sku}` : ""}</span>
                        </TD>
                        <TD className="text-right"><span className={s.available <= 0 ? "font-semibold text-red-600" : "text-amber-600"}>{s.available}</span></TD>
                        <TD className="text-right tabular-nums text-gray-400">{s.reorderPoint}</TD>
                        <TD className="text-right">
                          <Input type="number" inputMode="numeric" min="1" className="ml-auto h-9 w-24 text-right"
                            value={qty[rowKey(s)] ?? s.suggestedQty}
                            onChange={(e) => setQty((p) => ({ ...p, [rowKey(s)]: Math.max(1, Number(e.target.value) || 1) }))} />
                        </TD>
                        <TD className="text-right font-mono tabular-nums">{money(s.unitCost)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
