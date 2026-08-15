"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import {
  Badge, Button, Combobox, Dialog, EmptyState, FormField, Input, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { StockCount, Variant } from "@/lib/catalog-types";
import type { Warehouse } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";

const tone: Record<string, "gray" | "amber" | "blue" | "green" | "red"> = {
  DRAFT: "gray", IN_PROGRESS: "amber", SUBMITTED: "blue", APPROVED: "blue",
  APPLIED: "green", REJECTED: "red", CANCELLED: "red",
};

export default function CountsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [capturing, setCapturing] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["counts"], queryFn: () => api.get<StockCount[]>("/stock-counts") });
  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => api.get<Warehouse[]>("/warehouses") });

  const refresh = () => qc.invalidateQueries({ queryKey: ["counts"] });
  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: string }) => api.post(`/stock-counts/${id}/${verb}`),
    onSuccess: async () => { await refresh(); toast.push("Actualizado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conteos físicos</h1>
          <p className="text-sm text-gray-500">Conteo, diferencia, aprobación y aplicación al ledger</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-8 w-8 text-gray-400" />} title="Sin conteos" />
      ) : (
        <Table>
          <THead><TR><TH>Tipo</TH><TH>Ciego</TH><TH>Estado</TH><TH className="text-right">Acciones</TH></TR></THead>
          <TBody>
            {data.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.type}</TD>
                <TD>{c.blindCount ? "Sí" : "No"}</TD>
                <TD><Badge tone={tone[c.status] ?? "gray"}>{c.status}</Badge></TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    {c.status === "DRAFT" && <Button size="sm" variant="outline" onClick={() => action.mutate({ id: c.id, verb: "start" })}>Iniciar</Button>}
                    {c.status === "IN_PROGRESS" && <Button size="sm" variant="outline" onClick={() => setCapturing(c.id)}>Capturar</Button>}
                    {c.status === "IN_PROGRESS" && <Button size="sm" onClick={() => action.mutate({ id: c.id, verb: "submit" })}>Enviar</Button>}
                    {c.status === "SUBMITTED" && <Button size="sm" variant="outline" onClick={() => action.mutate({ id: c.id, verb: "approve" })}>Aprobar</Button>}
                    {c.status === "APPROVED" && <Button size="sm" onClick={() => action.mutate({ id: c.id, verb: "apply" })}>Aplicar</Button>}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CreateCountDialog open={creating} onClose={() => setCreating(false)} warehouses={warehouses ?? []}
        onCreated={async () => { setCreating(false); await refresh(); toast.push("Conteo creado", "success"); }} />
      <CaptureDialog countId={capturing} onClose={() => setCapturing(null)} onSaved={async () => { setCapturing(null); await refresh(); }} />
    </div>
  );
}

function CreateCountDialog({ open, onClose, warehouses, onCreated }: {
  open: boolean; onClose: () => void; warehouses: Warehouse[]; onCreated: () => void;
}) {
  const toast = useToast();
  const { data: variants } = useQuery({ queryKey: ["variants"], queryFn: () => api.get<Variant[]>("/variants"), enabled: open });
  const [warehouseId, setWarehouseId] = useState("");
  const [blind, setBlind] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () => api.post("/stock-counts", { warehouseId, type: "CUSTOM", blindCount: blind, variantIds: selected }),
    onSuccess: () => { setWarehouseId(""); setSelected([]); setBlind(false); onCreated(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  const toggle = (id: string) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  return (
    <Dialog open={open} onClose={onClose} title="Nuevo conteo"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={create.isPending} onClick={() => {
          if (!warehouseId || selected.length === 0) return toast.push("Almacén y al menos una variante", "error");
          create.mutate();
        }}>Crear</Button></>}>
      <div className="space-y-3">
        <FormField label="Almacén">
          <Combobox value={warehouseId} onChange={setWarehouseId} placeholder="Almacén…"
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
          Conteo ciego (no mostrar lo esperado)
        </label>
        <div>
          <p className="mb-2 text-xs font-medium text-gray-600">Variantes a contar</p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {variants?.map((v) => (
              <label key={v.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                  checked={selected.includes(v.id)} onChange={() => toggle(v.id)} />
                <span className="font-mono text-xs">{v.sku}</span> {v.name}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function CaptureDialog({ countId, onClose, onSaved }: {
  countId: string | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const enabled = Boolean(countId);
  const { data } = useQuery({
    queryKey: ["count", countId],
    queryFn: () => api.get<StockCount>(`/stock-counts/${countId}`),
    enabled,
  });
  const [counts, setCounts] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => api.post(`/stock-counts/${countId}/count`, {
      items: Object.entries(counts).filter(([, v]) => v !== "").map(([itemId, v]) => ({ itemId, countedQuantity: Number(v) })),
    }),
    onSuccess: onSaved,
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <Dialog open={enabled} onClose={onClose} title="Capturar conteo"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button></>}>
      <div className="space-y-2">
        {data?.items?.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-mono text-xs">{it.variantId.slice(0, 8)}</span>
            {data.blindCount ? null : <span className="text-gray-400">esperado: {it.expectedQuantity ?? "—"}</span>}
            <Input type="number" className="w-28" placeholder="Contado"
              value={counts[it.id] ?? ""} onChange={(e) => setCounts({ ...counts, [it.id]: e.target.value })} />
          </div>
        ))}
      </div>
    </Dialog>
  );
}
