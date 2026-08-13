"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, CameraOff, Check, Minus, Plus, ScanLine, Trash2 } from "lucide-react";
import { Button, FormField, Input, Select, useToast } from "@24hits/ui";
import type { CashSession, Customer, PosLookup } from "@/lib/catalog-types";
import type { Warehouse } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";

interface CartLine { variantId: string; sku: string; name: string; unitPrice: number; quantity: number; available: string | null }
const money = (v: number) => `$${v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PosPage() {
  const toast = useToast();
  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => api.get<Warehouse[]>("/warehouses") });
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => api.get<Customer[]>("/customers") });
  const { data: sessions } = useQuery({ queryKey: ["cash-sessions"], queryFn: () => api.get<CashSession[]>("/cash-sessions") });
  const openSessions = (sessions ?? []).filter((s) => s.status === "OPEN");

  const [warehouseId, setWarehouseId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState("CASH");
  const [cashSessionId, setCashSessionId] = useState("");
  const [manual, setManual] = useState("");

  const total = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  // --- Agregar por código de barras ---
  const addByBarcode = useCallback(async (code: string) => {
    if (!warehouseId) { toast.push("Selecciona primero el almacén", "error"); return; }
    try {
      const v = await api.get<PosLookup>(`/pos/lookup?barcode=${encodeURIComponent(code)}&warehouseId=${warehouseId}`);
      setCart((prev) => {
        const existing = prev.find((l) => l.variantId === v.variantId);
        if (existing) return prev.map((l) => l.variantId === v.variantId ? { ...l, quantity: l.quantity + 1 } : l);
        return [...prev, { variantId: v.variantId, sku: v.sku, name: v.name, unitPrice: Number(v.price ?? 0), quantity: 1, available: v.available }];
      });
      toast.push(`Agregado: ${v.name}`, "success");
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Código no reconocido", "error");
    }
  }, [warehouseId, toast]);

  // --- Escáner de cámara (ZXing) ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [scanning, setScanning] = useState(false);

  const stopScan = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    if (!warehouseId) { toast.push("Selecciona primero el almacén", "error"); return; }
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      setScanning(true);
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (result) => {
          if (!result) return;
          const code = result.getText();
          const now = Date.now();
          // Evita re-escanear el mismo código en ráfaga.
          if (code === lastScan.current.code && now - lastScan.current.at < 1800) return;
          lastScan.current = { code, at: now };
          void addByBarcode(code);
        }
      );
    } catch {
      setScanning(false);
      toast.push("No se pudo abrir la cámara. Da permiso o usa el código manual.", "error");
    }
  }, [warehouseId, addByBarcode, toast]);

  useEffect(() => () => stopScan(), [stopScan]);

  // --- Cobrar ---
  const sale = useMutation({
    mutationFn: () => api.post<{ order: { number: string }; saleNote: { number: string } | null }>("/pos/sale", {
      warehouseId,
      customerId: customerId || undefined,
      items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
      payment: { method, cashSessionId: method === "CASH" ? cashSessionId || undefined : undefined },
      issueSaleNote: true,
    }),
    onSuccess: (res) => {
      toast.push(`Venta registrada · ${res.order.number}${res.saleNote ? ` · Nota ${res.saleNote.number}` : ""}`, "success");
      setCart([]); setCustomerId("");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al cobrar", "error"),
  });

  function checkout() {
    if (!warehouseId) return toast.push("Selecciona el almacén", "error");
    if (cart.length === 0) return toast.push("El carrito está vacío", "error");
    if (method === "CASH" && !cashSessionId) return toast.push("Selecciona un turno de caja abierto", "error");
    sale.mutate();
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Punto de venta</h1>
        <p className="text-sm text-gray-500">Escanea el código de barras con la cámara y cobra en una operación</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* Columna izquierda: origen + escáner */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Almacén (origen del stock)">
              <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">Selecciona…</option>
                {warehouses?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Cliente (opcional)">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Mostrador</option>
                {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </FormField>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold"><ScanLine className="h-4 w-4" /> Escáner</span>
              {scanning
                ? <Button size="sm" variant="outline" onClick={stopScan}><CameraOff className="h-4 w-4" /> Detener</Button>
                : <Button size="sm" onClick={startScan}><Camera className="h-4 w-4" /> Encender cámara</Button>}
            </div>
            <div className="relative overflow-hidden rounded-lg bg-gray-900" style={{ aspectRatio: "4 / 3" }}>
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              {!scanning && (
                <div className="absolute inset-0 grid place-items-center text-center text-sm text-gray-400">
                  <span>Enciende la cámara y apunta al código de barras.<br />Funciona en iPhone (Safari) y Android (Chrome).</span>
                </div>
              )}
              {scanning && <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-brand/80" />}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { void addByBarcode(manual.trim()); setManual(""); } }}>
              <Input placeholder="…o teclea el código de barras" value={manual} onChange={(e) => setManual(e.target.value)} />
              <Button type="submit" variant="outline">Agregar</Button>
            </form>
          </div>
        </div>

        {/* Columna derecha: carrito + cobro */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white">
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
                      <button onClick={() => setCart(cart.filter((x) => x.variantId !== l.variantId))} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCart(cart.map((x) => x.variantId === l.variantId ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))} className="grid h-7 w-7 place-items-center rounded border border-gray-200 hover:bg-gray-50"><Minus className="h-3.5 w-3.5" /></button>
                        <span className="w-8 text-center text-sm tabular-nums">{l.quantity}</span>
                        <button onClick={() => setCart(cart.map((x) => x.variantId === l.variantId ? { ...x, quantity: x.quantity + 1 } : x))} className="grid h-7 w-7 place-items-center rounded border border-gray-200 hover:bg-gray-50"><Plus className="h-3.5 w-3.5" /></button>
                        <Input type="number" className="ml-2 w-24" value={l.unitPrice} onChange={(e) => setCart(cart.map((x) => x.variantId === l.variantId ? { ...x, unitPrice: Number(e.target.value) } : x))} />
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

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <FormField label="Método de pago">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="CASH">Efectivo</option>
                <option value="CARD">Tarjeta</option>
                <option value="TRANSFER">Transferencia</option>
                <option value="OTHER">Otro</option>
              </Select>
            </FormField>
            {method === "CASH" && (
              <FormField label="Turno de caja">
                <Select value={cashSessionId} onChange={(e) => setCashSessionId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {openSessions.map((s) => <option key={s.id} value={s.id}>{s.id.slice(0, 8)} · fondo ${Number(s.openingFloat).toFixed(2)}</option>)}
                </Select>
              </FormField>
            )}
            {method === "CASH" && openSessions.length === 0 && <p className="text-xs text-amber-600">No hay turno de caja abierto. Ábrelo en Caja → Turnos.</p>}
            <Button className="w-full" loading={sale.isPending} onClick={checkout}><Check className="h-4 w-4" /> Cobrar y registrar · {money(total)}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
