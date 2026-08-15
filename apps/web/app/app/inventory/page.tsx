"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import {
  Badge, Card, CardBody, Combobox, EmptyState, Skeleton, Table, TBody, TD, TH, THead, TR,
} from "@24hits/ui";
import type { InventoryBalanceRow } from "@/lib/catalog-types";
import type { Warehouse } from "@24hits/contracts";
import { api } from "@/lib/api";

const reorderTone: Record<InventoryBalanceRow["reorderStatus"], "green" | "amber" | "red"> = {
  OK: "green", LOW: "amber", OUT_OF_STOCK: "red",
};
const reorderLabel: Record<InventoryBalanceRow["reorderStatus"], string> = {
  OK: "OK", LOW: "Bajo", OUT_OF_STOCK: "Agotado",
};

export default function InventoryPage() {
  const [warehouseId, setWarehouseId] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => api.get<Warehouse[]>("/warehouses") });

  const params = new URLSearchParams();
  if (warehouseId) params.set("warehouseId", warehouseId);
  if (lowStock) params.set("lowStock", "true");
  const { data, isLoading } = useQuery({
    queryKey: ["inventory-balances", warehouseId, lowStock],
    queryFn: () => api.get<InventoryBalanceRow[]>(`/inventory?${params.toString()}`),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Existencias</h1>
      <p className="mb-6 text-sm text-gray-500">Inventario por variante y almacén (disponible = onHand − reservado − …)</p>

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-end gap-4">
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
        </CardBody>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Boxes className="h-8 w-8 text-gray-400" />} title="Sin existencias"
          description="Registra un saldo inicial (opening balance) desde la API o el módulo de inventario." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>SKU</TH><TH>Producto</TH><TH>Sabor</TH>
              <TH className="text-right">On hand</TH><TH className="text-right">Reservado</TH>
              <TH className="text-right">Disponible</TH><TH className="text-right">Dañado</TH>
              <TH className="text-right">Tránsito</TH><TH>Reorden</TH>
            </TR>
          </THead>
          <TBody>
            {data.map((r) => (
              <TR key={`${r.warehouseId}:${r.variantId}`}>
                <TD className="font-mono text-xs">{r.sku ?? "—"}</TD>
                <TD className="font-medium">{r.product ?? "—"}</TD>
                <TD className="text-gray-500">{r.flavor ?? "—"}</TD>
                <TD className="text-right">{r.onHand}</TD>
                <TD className="text-right text-gray-500">{r.reserved}</TD>
                <TD className="text-right font-semibold">{r.available}</TD>
                <TD className="text-right text-gray-500">{r.damaged}</TD>
                <TD className="text-right text-gray-500">{r.inTransitIncoming}</TD>
                <TD><Badge tone={reorderTone[r.reorderStatus]}>{reorderLabel[r.reorderStatus]}</Badge></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
