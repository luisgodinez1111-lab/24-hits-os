"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { Button, Dialog, FormField, Input, Select, useToast } from "@24hits/ui";
import type { Brand, Flavor, QuickRegisterResult } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { BarcodeScanner, type ScanFormat } from "./BarcodeScanner";

// Alta rápida de un producto (modelo) + sabor + código de barras en una sola
// pantalla. Se usa desde el catálogo y desde el POS cuando se escanea un código
// desconocido. Marca y sabor se sugieren (datalist) pero se crean si no existen.
export function QuickRegisterDialog({
  open,
  onClose,
  initialBarcode = "",
  initialType = "OTHER",
  onRegistered,
}: {
  open: boolean;
  onClose: () => void;
  initialBarcode?: string;
  initialType?: ScanFormat;
  onRegistered: (result: QuickRegisterResult) => void;
}) {
  const toast = useToast();
  const { data: brands } = useQuery({ queryKey: ["brands"], queryFn: () => api.get<Brand[]>("/brands"), enabled: open });
  const { data: flavors } = useQuery({ queryKey: ["flavors"], queryFn: () => api.get<Flavor[]>("/flavors"), enabled: open });

  const [barcode, setBarcode] = useState(initialBarcode);
  const [barcodeType, setBarcodeType] = useState<ScanFormat>(initialType);
  const [brandName, setBrandName] = useState("");
  const [productName, setProductName] = useState("");
  const [flavorName, setFlavorName] = useState("");
  const [price, setPrice] = useState("");

  // Sincroniza los valores prellenados al abrir con un código/tipo nuevos.
  useEffect(() => {
    if (open) {
      setBarcode(initialBarcode);
      setBarcodeType(initialType);
    }
  }, [open, initialBarcode, initialType]);

  const register = useMutation({
    mutationFn: () =>
      api.post<QuickRegisterResult>("/products/quick-register", {
        barcode: barcode.trim(),
        barcodeType,
        productName: productName.trim(),
        brandName: brandName.trim() || undefined,
        flavorName: flavorName.trim() || undefined,
        price: price.trim() ? Number(price) : undefined,
      }),
    onSuccess: (res) => {
      toast.push(`Alta creada: ${res.name}`, "success");
      onRegistered(res);
      setBrandName(""); setProductName(""); setFlavorName(""); setPrice("");
      onClose();
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error al dar de alta", "error"),
  });

  function submit() {
    if (!barcode.trim()) return toast.push("Escanea o teclea el código de barras", "error");
    if (!productName.trim()) return toast.push("Indica el modelo (nombre del producto)", "error");
    register.mutate();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Alta rápida por escaneo"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" loading={register.isPending} onClick={submit}>
            <PackagePlus className="h-4 w-4" /> Dar de alta
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <BarcodeScanner
          onScan={(code, fmt) => { setBarcode(code); setBarcodeType(fmt); }}
        />

        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <FormField label="Código de barras">
            <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Escanea o teclea" />
          </FormField>
          <FormField label="Tipo">
            <Select value={barcodeType} onChange={(e) => setBarcodeType(e.target.value as ScanFormat)}>
              <option value="EAN">EAN</option>
              <option value="UPC">UPC</option>
              <option value="CODE128">CODE128</option>
              <option value="QR_INTERNAL">QR</option>
              <option value="OTHER">Otro</option>
            </Select>
          </FormField>
        </div>

        <FormField label="Marca">
          <Input list="qr-brands" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Ej. Hyper Bar" />
          <datalist id="qr-brands">
            {brands?.map((b) => <option key={b.id} value={b.name} />)}
          </datalist>
        </FormField>

        <FormField label="Modelo (producto)">
          <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Ej. Hyper Bar 9000" />
        </FormField>

        <div className="grid grid-cols-2 gap-2">
          <FormField label="Sabor">
            <Input list="qr-flavors" value={flavorName} onChange={(e) => setFlavorName(e.target.value)} placeholder="Ej. Sandía" />
            <datalist id="qr-flavors">
              {flavors?.map((f) => <option key={f.id} value={f.name} />)}
            </datalist>
          </FormField>
          <FormField label="Precio (opcional)">
            <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </FormField>
        </div>
      </div>
    </Dialog>
  );
}
