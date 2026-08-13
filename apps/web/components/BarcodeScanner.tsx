"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@24hits/ui";

// Escáner de código de barras por cámara (ZXing). Funciona en iPhone (Safari) y
// Android (Chrome) sobre HTTPS. El <video> se renderiza siempre para que el ref
// exista al iniciar; import dinámico para no romper el SSR de Next.
export function BarcodeScanner({
  onScan,
  dedupeMs = 1800,
  autoStopOnScan = false,
}: {
  onScan: (code: string) => void;
  dedupeMs?: number;
  autoStopOnScan?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      setScanning(true);
      setError(null);
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (result) => {
          if (!result) return;
          const code = result.getText();
          const now = Date.now();
          if (code === last.current.code && now - last.current.at < dedupeMs) return;
          last.current = { code, at: now };
          onScan(code);
          if (autoStopOnScan) stop();
        }
      );
    } catch {
      setScanning(false);
      setError("No se pudo abrir la cámara. Da permiso o teclea el código.");
    }
  }, [onScan, dedupeMs, autoStopOnScan, stop]);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg bg-gray-900" style={{ aspectRatio: "4 / 3" }}>
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {!scanning && (
          <div className="absolute inset-0 grid place-items-center px-3 text-center text-xs text-gray-400">
            Toca “Escanear” y apunta al código de barras
          </div>
        )}
        {scanning && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-brand/80" />
        )}
      </div>
      <div className="flex items-center gap-2">
        {scanning ? (
          <Button size="sm" variant="outline" type="button" onClick={stop}><CameraOff className="h-4 w-4" /> Detener</Button>
        ) : (
          <Button size="sm" variant="outline" type="button" onClick={start}><Camera className="h-4 w-4" /> Escanear con cámara</Button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
