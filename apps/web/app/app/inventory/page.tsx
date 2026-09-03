"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, PackagePlus, Search, SlidersHorizontal } from "lucide-react";
import {
  Badge, Button, Card, CardBody, Combobox, EmptyState, Input, Skeleton, Table, TBody, TD, TH, THead, TR,
  PageHeader,
} from "@24hits/ui";
import type { InventoryBalanceRow } from "@/lib/catalog-types";
import type { Warehouse } from "@24hits/contracts";
import { api } from "@/lib/api";
import { hasPermission, useMe } from "@/lib/me";
import { StockAdjustDialog } from "@/components/StockAdjustDialog";

const reorderTone: Record<InventoryBalanceRow["reorderStatus"], "green" | "amber" | "red"> = {
  OK: "green", LOW: "amber", OUT_OF_STOCK: "red",
};
const reorderLabel: Record<InventoryBalanceRow["reorderStatus"], string> = {
  OK: "OK", LOW: "Bajo", OUT_OF_STOCK: "Agotado",
};

// "12.000000" -> "12". Las piezas son enteras; colapsamos decimales sobrantes.
const qty = (v: string | number) => String(Number(v));

type View = "pivot" | "detail";

export default function InventoryPage() {
  const [view, setView] = useState<View>("pivot");
  const [warehouseId, setWarehouseId] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [search, setSearch] = useState("");
  const [stockDialog, setStockDialog] = useState<{ variantId?: string; warehouseId?: string } | null>(null);
  const { data: me } = useMe();
  const canAdjust = hasPermission(me, "inventory.adjust");
  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => api.get<Warehouse[]>("/warehouses") });

  // En pivote traemos TODOS los almacenes (columnas por bodega). En detalle
  // respetamos el filtro de almacén y "stock bajo".
  const params = new URLSearchParams();
  if (view === "detail" && warehouseId) params.set("warehouseId", warehouseId);
  if (view === "detail" && lowStock) params.set("lowStock", "true");
  const { data, isLoading } = useQuery({
    queryKey: ["inventory-balances", view, warehouseId, lowStock],
    queryFn: () => api.get<InventoryBalanceRow[]>(`/inventory?${params.toString()}`),
  });

  const term = search.trim().toLowerCase();
  const matches = (r: InventoryBalanceRow) =>
    !term ||
    (r.product ?? "").toLowerCase().includes(term) ||
    (r.flavor ?? "").toLowerCase().includes(term) ||
    (r.sku ?? "").toLowerCase().includes(term);

  // Pivote: una fila por variante (modelo · sabor), una columna por bodega.
  const pivot = useMemo(() => {
    const rows = (data ?? []).filter(matches);
    // Columnas = bodegas presentes en los datos, ordenadas por nombre.
    const whSet = new Map<string, string>();
    for (const r of rows) whSet.set(r.warehouseId, r.warehouseName ?? "Almacén");
    const cols = [...whSet.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    // Filas agrupadas por variante.
    const byVariant = new Map<string, {
      variantId: string; product: string | null; flavor: string | null; sku: string | null;
      cells: Map<string, number>; total: number;
    }>();
    for (const r of rows) {
      let g = byVariant.get(r.variantId);
      if (!g) {
        g = { variantId: r.variantId, product: r.product, flavor: r.flavor, sku: r.sku, cells: new Map(), total: 0 };
        byVariant.set(r.variantId, g);
      }
      const n = Number(r.onHand);
      g.cells.set(r.warehouseId, (g.cells.get(r.warehouseId) ?? 0) + n);
      g.total += n;
    }
    const items = [...byVariant.values()].sort((a, b) =>
      (a.product ?? "").localeCompare(b.product ?? "", "es") ||
      (a.flavor ?? "").localeCompare(b.flavor ?? "", "es")
    );
    // Totales por bodega (pie de tabla).
    const colTotals = new Map<string, number>();
    let grand = 0;
    for (const it of items) {
      for (const c of cols) colTotals.set(c.id, (colTotals.get(c.id) ?? 0) + (it.cells.get(c.id) ?? 0));
      grand += it.total;
    }
    return { cols, items, colTotals, grand };
  }, [data, term]);

  return (
    <div>
      <PageHeader
        title="Existencias"
        subtitle="Piezas físicas por modelo, sabor y almacén (On hand = piezas en la bodega)"
        actions={canAdjust ? <Button onClick={() => setStockDialog({})}><PackagePlus className="h-4 w-4" /> Cargar / ajustar stock</Button> : undefined}
      />

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-end gap-4">
          {/* Toggle de vista. */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
            <button
              onClick={() => setView("pivot")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === "pivot" ? "bg-brand text-white" : "text-gray-600"}`}
            >
              Por bodega
            </button>
            <button
              onClick={() => setView("detail")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === "detail" ? "bg-brand text-white" : "text-gray-600"}`}
            >
              Detalle
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Buscar modelo / sabor / SKU</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input className="w-64 pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Elfbar, sandía, EB-01…" />
            </div>
          </label>

          {view === "detail" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Almacén</span>
                <Combobox className="w-48" value={warehouseId} onChange={setWarehouseId} placeholder="Todos"
                  options={[{ value: "", label: "Todos" }, ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))]} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                  checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />
                Solo stock bajo / agotado
              </label>
            </>
          )}
        </CardBody>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Boxes className="h-8 w-8 text-gray-400" />} title="Sin existencias"
          description="Registra un saldo inicial (opening balance) desde la API o el módulo de inventario." />
      ) : view === "pivot" ? (
        pivot.items.length === 0 ? (
          <EmptyState icon={<Boxes className="h-8 w-8 text-gray-400" />} title="Sin resultados"
            description="Ningún modelo/sabor coincide con tu búsqueda." />
        ) : (
          <Table stickyHeader>
            <THead>
              <TR>
                <TH>Modelo</TH><TH>Sabor</TH>
                {pivot.cols.map((c) => <TH key={c.id} className="text-right">{c.name}</TH>)}
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {pivot.items.map((it) => (
                <TR key={it.variantId}>
                  <TD className="font-medium">{it.product ?? "—"}</TD>
                  <TD className="text-gray-500">{it.flavor ?? "—"}</TD>
                  {pivot.cols.map((c) => {
                    const n = it.cells.get(c.id) ?? 0;
                    return <TD key={c.id} className={`text-right tabular-nums ${n === 0 ? "text-gray-300" : ""}`}>{qty(n)}</TD>;
                  })}
                  <TD className="text-right font-semibold tabular-nums">{qty(it.total)}</TD>
                </TR>
              ))}
              {/* Totales por bodega. */}
              <TR>
                <TD className="font-semibold text-gray-500">Total en existencia</TD>
                <TD>{""}</TD>
                {pivot.cols.map((c) => (
                  <TD key={c.id} className="text-right font-semibold tabular-nums">{qty(pivot.colTotals.get(c.id) ?? 0)}</TD>
                ))}
                <TD className="text-right font-bold tabular-nums">{qty(pivot.grand)}</TD>
              </TR>
            </TBody>
          </Table>
        )
      ) : (
        <Table stickyHeader>
          <THead>
            <TR>
              <TH>Almacén</TH><TH>SKU</TH><TH>Producto</TH><TH>Sabor</TH>
              <TH className="text-right">On hand</TH><TH className="text-right">Reservado</TH>
              <TH className="text-right">Disponible</TH><TH className="text-right">Dañado</TH>
              <TH className="text-right">Tránsito</TH><TH>Reorden</TH>
              {canAdjust && <TH>Ajuste</TH>}
            </TR>
          </THead>
          <TBody>
            {data.filter(matches).map((r) => (
              <TR key={`${r.warehouseId}:${r.variantId}`}>
                <TD className="font-medium">{r.warehouseName ?? "—"}</TD>
                <TD className="font-mono text-xs">{r.sku ?? "—"}</TD>
                <TD className="font-medium">{r.product ?? "—"}</TD>
                <TD className="text-gray-500">{r.flavor ?? "—"}</TD>
                <TD className="text-right">{qty(r.onHand)}</TD>
                <TD className="text-right text-gray-500">{qty(r.reserved)}</TD>
                <TD className="text-right font-semibold">{qty(r.available)}</TD>
                <TD className="text-right text-gray-500">{qty(r.damaged)}</TD>
                <TD className="text-right text-gray-500">{qty(r.inTransitIncoming)}</TD>
                <TD><Badge tone={reorderTone[r.reorderStatus]}>{reorderLabel[r.reorderStatus]}</Badge></TD>
                {canAdjust && (
                  <TD>
                    <button
                      onClick={() => setStockDialog({ variantId: r.variantId, warehouseId: r.warehouseId })}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 active:scale-95"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Ajustar
                    </button>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {canAdjust && (
        <StockAdjustDialog
          open={stockDialog !== null}
          prefill={stockDialog}
          warehouses={warehouses ?? []}
          onClose={() => setStockDialog(null)}
          onDone={() => setStockDialog(null)}
        />
      )}
    </div>
  );
}
