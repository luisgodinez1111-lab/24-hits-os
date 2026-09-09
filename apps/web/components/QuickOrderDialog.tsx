"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Minus, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Button, Combobox, Dialog, Input, useToast } from "@24hits/ui";
import type { Customer } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/me";

// Fila del catálogo plano (GET /variants/catalog) para buscar por nombre/sabor.
type ProdRow = { id: string; modelo: string | null; marca: string | null; sabor: string; sku: string; status: string; price: string | null };
type Line = { variantId: string; label: string; qty: number };

// Captura rápida de pedido a domicilio, pensada para copiar del WhatsApp: producto+sabor,
// cliente y ubicación. Sin almacén/reserva/COGS a la vista. El cobro es al entregar.
export function QuickOrderDialog({
  open, onClose, onCreated, customers,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  customers: Customer[];
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: me } = useMe();

  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [phone, setPhone] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setLines([]); setSearch(""); setCustomerId(""); setPhone(""); setLocationUrl(""); setNotes("");
  }, [open]);

  const { data: catalog } = useQuery({ queryKey: ["pos-catalog"], enabled: open, queryFn: () => api.get<ProdRow[]>("/variants/catalog") });
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as ProdRow[];
    return (catalog ?? [])
      .filter((r) => r.status === "ACTIVE" && (
        r.sabor.toLowerCase().includes(q) ||
        (r.modelo ?? "").toLowerCase().includes(q) ||
        (r.marca ?? "").toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q)
      ))
      .slice(0, 6);
  }, [catalog, search]);

  const addLine = (r: ProdRow) => {
    const label = r.modelo ? `${r.modelo} · ${r.sabor}` : r.sabor;
    setLines((prev) => {
      const found = prev.find((l) => l.variantId === r.id);
      if (found) return prev.map((l) => (l.variantId === r.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { variantId: r.id, label, qty: 1 }];
    });
    setSearch("");
  };
  const setQty = (variantId: string, delta: number) =>
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, qty: Math.max(1, l.qty + delta) } : l)));
  const removeLine = (variantId: string) => setLines((prev) => prev.filter((l) => l.variantId !== variantId));

  const create = useMutation({
    mutationFn: () =>
      api.post("/orders", {
        customerId: customerId || undefined,
        deliveryPhone: phone.trim() || undefined,
        deliveryLocationUrl: locationUrl.trim() || undefined,
        deliveryNotes: notes.trim() || undefined,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["sales-orders"] }); onCreated(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "No se pudo crear el pedido", "error"),
  });

  const ready = lines.length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nuevo pedido a domicilio"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" loading={create.isPending} disabled={!ready} onClick={() => {
            if (!me?.defaultWarehouse) return toast.push("No tienes un almacén asignado. Pídele a un admin que lo configure.", "error");
            create.mutate();
          }}>
            Crear pedido
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 1 · Producto */}
        <section>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">1 · Producto</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Busca modelo o sabor…" />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                {results.map((r) => (
                  <button key={r.id} type="button" onClick={() => addLine(r)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand/5">
                    <span><span className="font-medium">{r.modelo ?? r.sabor}</span>{r.modelo ? <span className="text-gray-500"> · {r.sabor}</span> : null}</span>
                    <Plus className="h-4 w-4 text-brand" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">Busca y toca un producto para agregarlo. Puedes agregar varios.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {lines.map((l) => (
                <div key={l.variantId} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.label}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="Restar" onClick={() => setQty(l.variantId, -1)} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 text-gray-600 active:scale-95"><Minus className="h-4 w-4" /></button>
                    <span className="w-6 text-center font-mono text-sm tabular-nums">{l.qty}</span>
                    <button type="button" aria-label="Sumar" onClick={() => setQty(l.variantId, 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 text-gray-600 active:scale-95"><Plus className="h-4 w-4" /></button>
                  </div>
                  <button type="button" aria-label="Quitar" onClick={() => removeLine(l.variantId)} className="grid h-8 w-8 place-items-center rounded-lg text-red-500 active:scale-95"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2 · Cliente */}
        <section>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">2 · Cliente</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Combobox value={customerId} onChange={setCustomerId} placeholder="Cliente (opcional)"
              options={[{ value: "", label: "Sin registrar" }, ...customers.map((c) => ({ value: c.id, label: c.name }))]} />
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono (WhatsApp)" inputMode="tel" />
          </div>
        </section>

        {/* 3 · Ubicación */}
        <section>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400"><MapPin className="h-3.5 w-3.5" /> 3 · Ubicación</p>
          <Input value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} placeholder="Pega el link de ubicación de WhatsApp / Google Maps" />
          <Input className="mt-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Referencia o nota de entrega (opcional)" />
          <p className="mt-1 text-[11px] text-gray-400">El sistema saca las coordenadas del link para trazar la ruta. Sin ubicación, el pedido no aparece en el mapa.</p>
        </section>

        {lines.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-brand/5 px-3 py-2 text-sm">
            <Badge tone="brand">{lines.reduce((s, l) => s + l.qty, 0)} pza</Badge>
            <span className="text-gray-600">El cobro se hace al entregar (efectivo, tarjeta o transferencia).</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}
