"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Barcode, ScanLine, Search } from "lucide-react";
import {
  Badge, Button, Combobox, EmptyState, Input, Select, Skeleton,
  Table, TBody, TD, TH, THead, TR,
} from "@24hits/ui";
import { hasPermission, useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { FlavorsDialog, type FlavorModel } from "@/components/FlavorsDialog";
import { QuickRegisterDialog } from "@/components/QuickRegisterDialog";

// Fila plana del catálogo: un SABOR con todo lo que se trabaja a escala.
type CatalogRow = {
  id: string;
  modeloId: string;
  modelo: string | null;
  marca: string | null;
  sabor: string;
  sku: string;
  status: string;
  price: string | null;
  barcode: string | null;
  barcodeCount: number;
  stock: number;
};

const money = (v?: string | null) => (v != null ? `$${Number(v).toFixed(2)}` : "—");
const LOW = 5; // umbral "poco stock"
type SortKey = "modelo" | "marca" | "price" | "stock";

// Vista de TABLA del catálogo: la eficiente a escala (cientos/miles de sabores).
// Buscas o escaneas (modelo · sabor · código · SKU) y ves resultados planos, densos y
// ordenables con precio · código · stock. La búsqueda/orden/filtro son en cliente
// (miles de filas ligeras); editar reusa el mismo editor de sabores.
export function CatalogTable() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canEdit = hasPermission(me, "products.update");
  const { data: rows, isLoading } = useQuery({
    queryKey: ["catalog-variants"],
    queryFn: () => api.get<CatalogRow[]>("/variants/catalog"),
  });

  const [q, setQ] = useState("");
  const [marca, setMarca] = useState("");
  const [estado, setEstado] = useState("");
  const [soloPoco, setSoloPoco] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "modelo", dir: 1 });
  const [visible, setVisible] = useState(100);
  const [editModel, setEditModel] = useState<FlavorModel | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // Marcas presentes (para el filtro), a partir de los datos.
  const marcas = useMemo(() => [...new Set((rows ?? []).map((r) => r.marca).filter((m): m is string => !!m))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = (rows ?? []).filter((r) => {
      if (marca && r.marca !== marca) return false;
      if (estado === "ACTIVE" && r.status !== "ACTIVE") return false;
      if (estado === "INACTIVE" && r.status === "ACTIVE") return false;
      if (soloPoco && r.stock > LOW) return false;
      if (!needle) return true;
      // Busca en modelo · sabor · marca · SKU · código (así encuentras/escaneas cualquiera).
      return (
        (r.modelo ?? "").toLowerCase().includes(needle) ||
        r.sabor.toLowerCase().includes(needle) ||
        (r.marca ?? "").toLowerCase().includes(needle) ||
        r.sku.toLowerCase().includes(needle) ||
        (r.barcode ?? "").toLowerCase().includes(needle)
      );
    });
    const { key, dir } = sort;
    out = [...out].sort((a, b) => {
      let d = 0;
      if (key === "price") d = Number(a.price ?? 0) - Number(b.price ?? 0);
      else if (key === "stock") d = a.stock - b.stock;
      else if (key === "marca") d = (a.marca ?? "").localeCompare(b.marca ?? "");
      else d = `${a.modelo ?? ""} ${a.sabor}`.localeCompare(`${b.modelo ?? ""} ${b.sabor}`);
      return d * dir;
    });
    return out;
  }, [rows, q, marca, estado, soloPoco, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  const SortHead = ({ k, children, align = "left" }: { k: SortKey; children: ReactNode; align?: "left" | "right" }) => (
    <TH>
      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 hover:text-gray-900 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {children}
        {sort.key === k ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
      </button>
    </TH>
  );

  return (
    <div className="space-y-3">
      {/* Controles: buscar/escanear + filtros + alta. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input className="h-9 pl-9" placeholder="Buscar o escanear — modelo · sabor · código · SKU" value={q}
            onChange={(e) => { setQ(e.target.value); setVisible(100); }} />
        </div>
        <Combobox className="w-40" value={marca} onChange={(v) => { setMarca(v); setVisible(100); }} placeholder="Todas las marcas"
          options={[{ value: "", label: "Todas las marcas" }, ...marcas.map((m) => ({ value: m, label: m }))]} />
        <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="ACTIVE">Activos</option>
          <option value="INACTIVE">De baja</option>
        </Select>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" checked={soloPoco} onChange={(e) => setSoloPoco(e.target.checked)} />
          Poco stock
        </label>
        {canEdit && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setScanOpen(true)}>
            <ScanLine className="h-4 w-4" /> Alta por escaneo
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Barcode className="h-8 w-8 text-gray-400" />} title="Sin resultados" description="Prueba con otra búsqueda o quita los filtros." />
      ) : (
        <>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            {filtered.length} {filtered.length === 1 ? "sabor" : "sabores"}{(rows?.length ?? 0) !== filtered.length ? ` de ${rows?.length}` : ""}
          </p>
          <Table stickyHeader>
            <THead>
              <TR>
                <SortHead k="modelo">Modelo · Sabor</SortHead>
                <SortHead k="marca">Marca</SortHead>
                <SortHead k="price" align="right">Precio</SortHead>
                <TH>Código</TH>
                <SortHead k="stock" align="right">Stock</SortHead>
                <TH>{" "}</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.slice(0, visible).map((r) => (
                <TR key={r.id} className={r.status !== "ACTIVE" ? "opacity-60" : undefined}>
                  <TD>
                    <span className="font-medium text-gray-900">{r.sabor}</span>
                    <span className="block text-xs text-gray-400">{r.modelo ?? "—"}</span>
                  </TD>
                  <TD className="text-gray-500">{r.marca ?? "—"}</TD>
                  <TD className="text-right font-mono tabular-nums">{money(r.price)}</TD>
                  <TD>
                    {r.barcode ? (
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-gray-600" title={r.barcodeCount > 1 ? `${r.barcodeCount} códigos` : undefined}>
                        <Barcode className="h-3.5 w-3.5 text-green-600" /> {r.barcode}{r.barcodeCount > 1 ? ` +${r.barcodeCount - 1}` : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600">falta código</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Badge tone={r.stock <= 0 ? "red" : r.stock <= LOW ? "amber" : "gray"}>
                      <span className="tabular-nums">{r.stock}</span> pz
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {canEdit && (
                      <Button size="sm" variant="outline" onClick={() => setEditModel({ id: r.modeloId, name: r.modelo ?? r.sabor })}>
                        Editar
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {visible < filtered.length && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + 100)}>
                Cargar más ({filtered.length - visible} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      {/* Editar precio · código · stock del sabor (reusa el editor del catálogo). */}
      <FlavorsDialog model={editModel} onClose={() => setEditModel(null)} onChanged={() => { void qc.invalidateQueries({ queryKey: ["catalog-variants"] }); }} />
      <QuickRegisterDialog open={scanOpen} onClose={() => setScanOpen(false)} onRegistered={() => { void qc.invalidateQueries({ queryKey: ["catalog-variants"] }); }} />
    </div>
  );
}
