"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Plus } from "lucide-react";
import {
  Badge, Button, Card, CardBody, Combobox, Dialog, EmptyState, FormField, Input, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { PriceList, Variant } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

interface PriceListDetail extends PriceList {
  items: Array<{ id: string; variantId: string; price: string; minimumPrice: string | null }>;
}

export default function PricingPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: lists, isLoading } = useQuery({ queryKey: ["price-lists"], queryFn: () => api.get<PriceList[]>("/pricing/price-lists") });

  const createList = useMutation({
    mutationFn: (name: string) => api.post("/pricing/price-lists", { name, type: "RETAIL", currency: "MXN" }),
    onSuccess: async () => { setCreating(false); await qc.invalidateQueries({ queryKey: ["price-lists"] }); toast.push("Lista creada", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  const [newName, setNewName] = useState("");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Precios</h1>
          <p className="text-sm text-gray-500">Listas de precios (retail, mayoreo, especial) con historial</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nueva lista</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !lists || lists.length === 0 ? (
        <EmptyState icon={<DollarSign className="h-8 w-8 text-gray-400" />} title="Sin listas de precios" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => (
            <Card key={l.id}>
              <CardBody className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-xs text-gray-500">{l.currency}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone="brand">{l.type}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setOpenId(l.id)}>Precios</Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nueva lista de precios"
        footer={<><Button variant="outline" size="sm" onClick={() => setCreating(false)}>Cancelar</Button>
          <Button size="sm" loading={createList.isPending} onClick={() => newName.trim() && createList.mutate(newName)}>Crear</Button></>}>
        <FormField label="Nombre"><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Retail general" /></FormField>
      </Dialog>

      <PriceListDialog listId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function PriceListDialog({ listId, onClose }: { listId: string | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const enabled = Boolean(listId);
  const { data: detail } = useQuery({
    queryKey: ["price-list", listId],
    queryFn: () => api.get<PriceListDetail>(`/pricing/price-lists/${listId}`),
    enabled,
  });
  const { data: variants } = useQuery({ queryKey: ["variants"], queryFn: () => api.get<Variant[]>("/variants"), enabled });
  const [form, setForm] = useState({ variantId: "", price: "", minimumPrice: "" });

  const setPrice = useMutation({
    mutationFn: () => api.post(`/pricing/price-lists/${listId}/items`, {
      variantId: form.variantId, price: Number(form.price), minimumPrice: form.minimumPrice ? Number(form.minimumPrice) : undefined,
    }),
    onSuccess: async () => { setForm({ variantId: "", price: "", minimumPrice: "" }); await qc.invalidateQueries({ queryKey: ["price-list", listId] }); toast.push("Precio actualizado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  const skuOf = (variantId: string) => variants?.find((v) => v.id === variantId)?.sku ?? variantId.slice(0, 8);

  return (
    <Dialog open={enabled} onClose={onClose} title={`Precios — ${detail?.name ?? ""}`}>
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-2 text-xs font-semibold text-gray-600">Fijar precio</p>
          <div className="grid grid-cols-3 gap-2">
            <Combobox value={form.variantId} placeholder="Variante…"
              onChange={(v) => setForm({ ...form, variantId: v })}
              options={(variants ?? []).map((v) => ({ value: v.id, label: `${v.sku} · ${v.name}` }))} />
            <Input type="number" placeholder="Precio" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <Input type="number" placeholder="Mínimo" value={form.minimumPrice} onChange={(e) => setForm({ ...form, minimumPrice: e.target.value })} />
          </div>
          <Button size="sm" className="mt-2" loading={setPrice.isPending}
            onClick={() => form.variantId && form.price ? setPrice.mutate() : toast.push("Variante y precio requeridos", "error")}>Guardar</Button>
        </div>

        {detail?.items?.length ? (
          <Table>
            <THead><TR><TH>Variante</TH><TH className="text-right">Precio</TH><TH className="text-right">Mínimo</TH></TR></THead>
            <TBody>
              {detail.items.map((it) => (
                <TR key={it.id}>
                  <TD className="font-mono text-xs">{skuOf(it.variantId)}</TD>
                  <TD className="text-right font-semibold">${Number(it.price).toFixed(2)}</TD>
                  <TD className="text-right text-gray-500">{it.minimumPrice ? `$${Number(it.minimumPrice).toFixed(2)}` : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <p className="text-sm text-gray-400">Aún sin precios en esta lista.</p>}
      </div>
    </Dialog>
  );
}
