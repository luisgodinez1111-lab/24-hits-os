"use client";

import { useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, ChevronDown, Plus } from "lucide-react";
import { Badge, Button, Combobox, Dialog, Input, Select, useToast } from "@24hits/ui";
import type { Flavor, Variant } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { hasPermission, useMe } from "@/lib/me";
import { BarcodeScanner } from "@/components/BarcodeScanner";

// Referencia mínima a un modelo (lo único que necesita el editor de sabores).
export type FlavorModel = { id: string; name: string };

// Precio "$180.00" o "—" si no tiene.
const money = (v?: string | null) => (v != null ? `$${Number(v).toFixed(2)}` : "—");

// Editor de sabores de un modelo. Alta de un tiro: escanea el código, escribe el
// sabor y su precio — el SKU y la unidad "Pieza" se generan solos y el código queda
// como primario (backend atómico). El acordeón de cada sabor es para EDITAR después
// (agregar más códigos o cambiar el precio). Compartido por la tabla de Modelos y el
// árbol Marca → Modelo → Sabor.
export function FlavorsDialog({ model, onClose, onChanged }: {
  model: FlavorModel | null; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const enabled = Boolean(model);
  const { data: me } = useMe();
  const canPrice = hasPermission(me, "pricing.manage");
  const { data: detail, refetch } = useQuery({
    queryKey: ["product", model?.id],
    queryFn: () => api.get<{ variants: Variant[] }>(`/products/${model!.id}`),
    enabled,
  });
  const { data: flavors } = useQuery({ queryKey: ["flavors"], queryFn: () => api.get<Flavor[]>("/flavors"), enabled });
  const [flavorName, setFlavorName] = useState("");
  const [price, setPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [barcodeType, setBarcodeType] = useState("EAN");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Alta de un sabor COMPLETA en una sola acción: sabor + precio + código de barras.
  // El backend crea el sabor (si no existe), genera el SKU, pone unidad "Pieza",
  // guarda el código como primario y el precio — todo atómico. Tras agregar, limpia
  // y queda listo para el siguiente (ritmo "rack": escanea → sabor → precio → Enter).
  const create = useMutation({
    mutationFn: () => api.post(`/products/${model!.id}/variants`, {
      flavorName: flavorName.trim(),
      name: flavorName.trim(),
      ...(price.trim() ? { price: Number(price) } : {}),
      ...(barcode.trim() ? { barcode: barcode.trim(), barcodeType } : {}),
    }),
    onSuccess: async () => {
      setFlavorName(""); setPrice(""); setBarcode(""); setBarcodeType("EAN");
      await refetch();
      void qc.invalidateQueries({ queryKey: ["flavors"] });
      onChanged();
      toast.push("Sabor agregado ✓", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  // Enter en precio o código dispara el alta (si ya hay sabor) — ritmo sin mouse.
  const submitOnEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter" && flavorName.trim() && !create.isPending) { e.preventDefault(); create.mutate(); }
  };

  return (
    <Dialog open={enabled} onClose={onClose} title={`Sabores — ${model?.name ?? ""}`}>
      <div className="space-y-3">
        {detail?.variants?.length ? (
          <div className="space-y-1">
            {detail.variants.map((v) => (
              <div key={v.id} className="rounded-lg border border-gray-200">
                <button type="button" onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <span className="font-medium">{v.flavor?.name ?? v.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">{money(v.price)}</span>
                    <Badge tone={v.barcodes && v.barcodes.length ? "green" : "gray"}>
                      <Barcode className="mr-1 inline h-3 w-3" />{v.barcodes?.length ?? 0}
                    </Badge>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded === v.id ? "rotate-180" : ""}`} />
                  </span>
                </button>
                {expanded === v.id && (
                  <div className="space-y-3 border-t border-gray-100 px-3 py-3">
                    {canPrice && <VariantPrice variant={v} onChanged={refetch} />}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-gray-500">Código(s) de barras de este sabor</p>
                      <VariantBarcodes variant={v} onChanged={refetch} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-400">Aún no hay sabores. Agrega el primero abajo.</p>}

        <div className="rounded-xl border-2 border-brand/30 bg-brand/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">Agregar sabor</p>

          {/* Escaneo primero: al leer, llena el código y su tipo de una. */}
          <BarcodeScanner onScan={(c, fmt) => { setBarcode(c); setBarcodeType(fmt); }} />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Combobox
              value={flavorName}
              onChange={setFlavorName}
              placeholder="Sabor (ej. Sandía)"
              options={(flavors ?? []).map((f) => ({ value: f.name, label: f.name }))}
              allowCreate
              onCreate={async (name) => name.trim()}
            />
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <Input type="number" inputMode="decimal" min="0" className="pl-6" placeholder="Precio" value={price}
                onChange={(e) => setPrice(e.target.value)} onKeyDown={submitOnEnter} />
            </div>
          </div>

          <div className="mt-2 flex gap-2">
            <Input className="flex-1 font-mono" placeholder="Código de barras (escanea o teclea)" value={barcode}
              onChange={(e) => setBarcode(e.target.value)} onKeyDown={submitOnEnter} />
            <Select value={barcodeType} onChange={(e) => setBarcodeType(e.target.value)}>
              <option value="EAN">EAN</option>
              <option value="UPC">UPC</option>
              <option value="CODE128">CODE128</option>
              <option value="QR_INTERNAL">QR</option>
              <option value="OTHER">Otro</option>
            </Select>
          </div>

          <Button className="mt-2.5 w-full" loading={create.isPending}
            onClick={() => flavorName.trim() ? create.mutate() : toast.push("Escribe el sabor", "error")}>
            <Plus className="h-4 w-4" /> Agregar sabor
          </Button>
          <p className="mt-1.5 text-[11px] text-gray-500">Escanea el código, escribe el sabor y su precio, y pulsa Enter. Se agrega con todo — el SKU y la unidad “Pieza” salen solos. Listo para el siguiente.</p>
        </div>
      </div>
    </Dialog>
  );
}

// Edita el precio de venta (RETAIL) del sabor. Prefijado con el precio vigente.
function VariantPrice({ variant, onChanged }: { variant: Variant; onChanged: () => Promise<unknown> }) {
  const toast = useToast();
  const [price, setPrice] = useState(variant.price ?? "");

  const save = useMutation({
    mutationFn: () => api.post(`/pricing/variants/${variant.id}/price`, { price: Number(price) }),
    onSuccess: async () => { await onChanged(); toast.push("Precio actualizado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al guardar el precio", "error"),
  });

  const changed = price.trim() !== "" && price !== (variant.price ?? "");

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-gray-500">Precio de venta</p>
      <div className="flex items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
          <Input type="number" inputMode="decimal" min="0" className="w-36 pl-6" value={price}
            onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </div>
        <Button size="sm" loading={save.isPending} disabled={!changed}
          onClick={() => price.trim() ? save.mutate() : toast.push("Escribe un precio", "error")}>
          Guardar precio
        </Button>
      </div>
    </div>
  );
}

function VariantBarcodes({ variant, onChanged }: { variant: Variant; onChanged: () => Promise<unknown> }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [type, setType] = useState("EAN");
  const hasCodes = Boolean(variant.barcodes && variant.barcodes.length);

  const add = useMutation({
    mutationFn: () => api.post(`/variants/${variant.id}/barcodes`, { barcode: code.trim(), type, isPrimary: !hasCodes }),
    onSuccess: async () => { setCode(""); await onChanged(); toast.push("Código agregado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al guardar el código", "error"),
  });

  return (
    <div className="space-y-3">
      {hasCodes ? (
        <div className="flex flex-wrap gap-2">
          {variant.barcodes!.map((b, i) => (
            <span key={`${b.barcode}-${i}`} className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 font-mono text-xs">
              {b.barcode}<span className="text-[10px] uppercase text-gray-400">{b.type}</span>
            </span>
          ))}
        </div>
      ) : <p className="text-xs text-gray-400">Sin códigos de barras. Escanéalo con la cámara o tecléalo.</p>}

      <BarcodeScanner onScan={(c, fmt) => { setCode(c); setType(fmt); }} />

      <div className="flex gap-2">
        <Input placeholder="Código de barras" value={code} onChange={(e) => setCode(e.target.value)} />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="EAN">EAN</option>
          <option value="UPC">UPC</option>
          <option value="CODE128">CODE128</option>
          <option value="QR_INTERNAL">QR</option>
          <option value="OTHER">Otro</option>
        </Select>
        <Button size="sm" loading={add.isPending}
          onClick={() => code.trim() ? add.mutate() : toast.push("Escanea o teclea un código", "error")}>
          Guardar
        </Button>
      </div>
    </div>
  );
}
