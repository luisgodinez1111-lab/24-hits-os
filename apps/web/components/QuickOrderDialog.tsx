"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { Badge, Button, Dialog, Input, useToast } from "@24hits/ui";
import type { Customer } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/me";
import { customerMatches, phoneKey } from "@/lib/phone";

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
  const [custQuery, setCustQuery] = useState("");
  const [custName, setCustName] = useState("");
  const [phone, setPhone] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setLines([]); setSearch(""); setCustomerId(""); setCustQuery(""); setCustName(""); setPhone(""); setLocationUrl(""); setNotes("");
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

  // Cliente por nombre O WhatsApp (tolera +52/52/521/espacios). Si no existe, se crea
  // con el número al guardar el pedido (el backend hace el encontrar-o-crear).
  const selectedCustomer = customerId ? customers.find((c) => c.id === customerId) ?? null : null;
  const custResults = useMemo(() => {
    const q = custQuery.trim();
    if (!q) return [] as Customer[];
    return customers.filter((c) => customerMatches(c, q)).slice(0, 6);
  }, [customers, custQuery]);
  const newDigits = phoneKey(custQuery);
  const showNewRow = newDigits.length >= 7 && !custResults.some((c) => phoneKey(c.phone) === newDigits);
  const pickExisting = (c: Customer) => { setCustomerId(c.id); setPhone(c.phone ?? ""); setCustName(""); setCustQuery(""); };
  const pickNew = () => { setCustomerId(""); setPhone(custQuery.trim()); setCustName(""); setCustQuery(""); };
  const clearCustomer = () => { setCustomerId(""); setPhone(""); setCustName(""); setCustQuery(""); };

  const create = useMutation({
    mutationFn: () =>
      api.post("/orders", {
        customerId: customerId || undefined,
        customerName: !customerId && custName.trim() ? custName.trim() : undefined,
        deliveryPhone: phone.trim() || undefined,
        deliveryLocationUrl: locationUrl.trim() || undefined,
        deliveryNotes: notes.trim() || undefined,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sales-orders"] });
      // El pedido pudo dar de alta un cliente nuevo (por WhatsApp) → refresca la lista
      // de clientes para que su nombre aparezca al instante en Pedidos (no el id).
      void qc.invalidateQueries({ queryKey: ["customers"] });
      onCreated();
    },
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

        {/* 2 · Cliente (por nombre o WhatsApp) */}
        <section>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">2 · Cliente</p>

          {selectedCustomer ? (
            // Cliente existente elegido
            <div className="flex items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{selectedCustomer.name}</span>
                {selectedCustomer.phone ? <span className="text-gray-500"> · {selectedCustomer.phone}</span> : null}
              </span>
              <button type="button" aria-label="Quitar cliente" onClick={clearCustomer} className="shrink-0 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>
          ) : phone.trim() ? (
            // Cliente nuevo por número (se crea al guardar)
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-green-800">Cliente nuevo · <b className="font-mono">{phone.trim()}</b></span>
                <button type="button" aria-label="Quitar" onClick={clearCustomer} className="shrink-0 text-green-700 hover:text-green-900"><X className="h-4 w-4" /></button>
              </div>
              <Input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Nombre del cliente (opcional)" />
              <p className="text-[11px] text-gray-400">Se registrará con este WhatsApp{custName.trim() ? ` a nombre de “${custName.trim()}”` : ""}; su historial de compras queda ligado al número.</p>
            </div>
          ) : (
            // Buscar por nombre o WhatsApp
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input className="pl-8" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="Busca por nombre o WhatsApp… (o pega el número)" />
              {(custResults.length > 0 || showNewRow) && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {custResults.map((c) => (
                    <button key={c.id} type="button" onClick={() => pickExisting(c)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand/5">
                      <span className="min-w-0 truncate"><span className="font-medium">{c.name}</span>{c.phone ? <span className="text-gray-500"> · {c.phone}</span> : null}</span>
                    </button>
                  ))}
                  {showNewRow && (
                    <button type="button" onClick={pickNew}
                      className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-brand hover:bg-brand/5">
                      <Plus className="h-4 w-4" /> Nuevo cliente con «{custQuery.trim()}»
                    </button>
                  )}
                </div>
              )}
              <p className="mt-1 text-[11px] text-gray-400">Nombre o WhatsApp del cliente. Si es nuevo, se registra con el número.</p>
            </div>
          )}
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
