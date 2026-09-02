"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Minus, Plus, ScanLine, Trash2 } from "lucide-react";
import { Button, Combobox, FormField, IconButton, Input, Segmented, useToast } from "@24hits/ui";
import type { Customer, PosLookup, QuickRegisterResult } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { useMe } from "@/lib/me";
import { BarcodeScanner, type ScanFormat } from "@/components/BarcodeScanner";
import { QuickRegisterDialog } from "@/components/QuickRegisterDialog";

interface CartLine { variantId: string; sku: string; name: string; unitPrice: number; quantity: number; available: string | null }

export default function PosPage() {
  const toast = useToast();
  const { data: me } = useMe();
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => api.get<Customer[]>("/customers") });

  // Almacén fijo del usuario (operación por usuario).
  const warehouseId = me?.defaultWarehouse?.id ?? "";
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<"CASH" | "CARD" | "TRANSFER" | "OTHER">("CASH");
  const [manual, setManual] = useState("");
  const [quick, setQuick] = useState<{ open: boolean; barcode: string; type: ScanFormat }>({ open: false, barcode: "", type: "OTHER" });

  const total = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  // Agrega o incrementa una línea del carrito.
  const addLine = useCallback((v: { variantId: string; sku: string; name: string; unitPrice: number; available: string | null }) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === v.variantId);
      if (existing) return prev.map((l) => (l.variantId === v.variantId ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { ...v, quantity: 1 }];
    });
  }, []);

  // --- Agregar por código de barras ---
  const addByBarcode = useCallback(
    async (code: string, fmt: ScanFormat = "OTHER") => {
      if (!warehouseId) { toast.push("No tienes un almacén asignado. Pídele a un admin que lo configure.", "error"); return; }
      try {
        const v = await api.get<PosLookup>(`/pos/lookup?barcode=${encodeURIComponent(code)}&warehouseId=${warehouseId}`);
        addLine({ variantId: v.variantId, sku: v.sku, name: v.name, unitPrice: Number(v.price ?? 0), available: v.available });
        toast.push(`Agregado: ${v.name}`, "success");
      } catch (e) {
        // Código no registrado → abre el alta rápida prellenada para darlo de alta.
        if (e instanceof ApiError && e.status === 404) {
          setQuick({ open: true, barcode: code, type: fmt });
        } else {
          toast.push(e instanceof ApiError ? e.message : "Código no reconocido", "error");
        }
      }
    },
    [warehouseId, addLine, toast]
  );

  // --- Cobrar ---
  const sale = useMutation({
    mutationFn: () => api.post<{ order: { number: string }; saleNote: { number: string } | null }>("/pos/sale", {
      warehouseId,
      customerId: customerId || undefined,
      items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
      payment: { method },
      issueSaleNote: true,
    }),
    onSuccess: (res) => {
      toast.push(`Venta registrada · ${res.order.number}${res.saleNote ? ` · Nota ${res.saleNote.number}` : ""}`, "success");
      setCart([]); setCustomerId("");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al cobrar", "error"),
  });

  function checkout() {
    if (!warehouseId) return toast.push("No tienes un almacén asignado. Pídele a un admin que lo configure.", "error");
    if (cart.length === 0) return toast.push("El carrito está vacío", "error");
    sale.mutate();
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-title text-gray-900">Punto de venta</h1>
        <p className="text-sm text-gray-500">Escanea el código de barras con la cámara y cobra en una operación</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* Columna izquierda: origen + escáner */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Almacén">
              {me?.defaultWarehouse
                ? <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-medium text-gray-700">{me.defaultWarehouse.name}</div>
                : <div className="flex h-10 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs text-amber-700">Sin almacén asignado</div>}
            </FormField>
            <FormField label="Cliente (opcional)">
              <Combobox
                value={customerId}
                onChange={setCustomerId}
                placeholder="Mostrador"
                options={[{ value: "", label: "Mostrador" }, ...(customers ?? []).map((c) => ({ value: c.id, label: c.name }))]}
              />
            </FormField>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold"><ScanLine className="h-4 w-4" /> Escáner</span>
              <button type="button" onClick={() => setQuick({ open: true, barcode: "", type: "OTHER" })} className="text-xs font-medium text-brand hover:underline">
                Dar de alta un producto
              </button>
            </div>

            {/* Escáner continuo: sigue leyendo para cargar varios productos seguidos. */}
            <BarcodeScanner continuous onScan={addByBarcode} />

            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { void addByBarcode(manual.trim()); setManual(""); } }}>
              <Input data-testid="pos-barcode-input" placeholder="…o teclea el código de barras" value={manual} onChange={(e) => setManual(e.target.value)} />
              <Button type="submit" variant="outline" data-testid="pos-add-btn">Agregar</Button>
            </form>
          </div>
        </div>

        {/* Columna derecha: carrito + cobro */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white shadow-card">
            <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">Carrito ({cart.length})</div>
            {cart.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">Escanea o agrega productos.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {cart.map((l) => (
                  <li key={l.variantId} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="font-mono text-xs text-gray-400">{l.sku}{l.available != null && Number(l.available) < l.quantity ? <span className="ml-2 text-red-500">stock {Number(l.available)}</span> : null}</p>
                      </div>
                      <IconButton tone="danger" size="sm" label={`Quitar ${l.name} del carrito`} onClick={() => setCart(cart.filter((x) => x.variantId !== l.variantId))}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button type="button" aria-label="Restar uno" onClick={() => setCart(cart.map((x) => x.variantId === l.variantId ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 outline-none transition duration-fast hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-brand active:scale-95 motion-reduce:active:scale-100"><Minus className="h-4 w-4" /></button>
                        <span className="w-8 text-center text-sm font-medium tabular-nums">{l.quantity}</span>
                        <button type="button" aria-label="Sumar uno" onClick={() => setCart(cart.map((x) => x.variantId === l.variantId ? { ...x, quantity: x.quantity + 1 } : x))} className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-gray-600 outline-none transition duration-fast hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-brand active:scale-95 motion-reduce:active:scale-100"><Plus className="h-4 w-4" /></button>
                        <Input type="number" className="ml-2 h-9 w-24" value={l.unitPrice} onChange={(e) => setCart(cart.map((x) => x.variantId === l.variantId ? { ...x, unitPrice: Number(e.target.value) } : x))} aria-label="Precio unitario" />
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{money(l.unitPrice * l.quantity)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <span className="text-sm text-gray-500">Total</span>
              <span className="text-xl font-bold tabular-nums">{money(total)}</span>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-card">
            <FormField label="Método de pago">
              <Segmented
                full
                ariaLabel="Método de pago"
                value={method}
                onChange={setMethod}
                options={[
                  { value: "CASH", label: "Efectivo" },
                  { value: "CARD", label: "Tarjeta" },
                  { value: "TRANSFER", label: "Transf." },
                  { value: "OTHER", label: "Otro" },
                ]}
              />
            </FormField>
            <Button size="lg" className="w-full" loading={sale.isPending} onClick={checkout} data-testid="pos-charge-btn"><Check className="h-4 w-4" /> Cobrar y registrar · {money(total)}</Button>
          </div>
        </div>
      </div>

      <QuickRegisterDialog
        open={quick.open}
        initialBarcode={quick.barcode}
        initialType={quick.type}
        onClose={() => setQuick((q) => ({ ...q, open: false }))}
        onRegistered={(res: QuickRegisterResult) =>
          addLine({ variantId: res.variantId, sku: res.sku, name: res.name, unitPrice: Number(res.price ?? 0), available: res.available })
        }
      />
    </div>
  );
}
