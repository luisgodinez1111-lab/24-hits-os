"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine, SwitchCamera, Zap, ZapOff } from "lucide-react";
import { Button } from "@24hits/ui";

// Tipo de código que devolvemos, alineado con el enum BarcodeType del backend.
export type ScanFormat = "EAN" | "UPC" | "CODE128" | "QR_INTERNAL" | "OTHER";

// Controles que expone ZXing al iniciar el stream.
interface ScannerControls {
  stop: () => void;
  switchTorch?: (onOff: boolean) => Promise<void>;
}

// Mapea el formato numérico de ZXing (BarcodeFormat) a nuestro BarcodeType.
// Valores estables del enum en @zxing/library ^0.23: EAN_8=6, EAN_13=7,
// CODE_128=4, QR_CODE=11, UPC_A=14, UPC_E=15.
const FORMAT_TO_TYPE: Record<number, ScanFormat> = {
  6: "EAN",
  7: "EAN",
  14: "UPC",
  15: "UPC",
  4: "CODE128",
  11: "QR_INTERNAL",
};

const LS_DEVICE_KEY = "24hits.scanner.deviceId";

// Escáner de código de barras por cámara, nivel producción:
// - Formatos de retail restringidos (más rápido y preciso que "todos").
// - Selección de cámara (recuerda la última) y linterna cuando el equipo la soporta.
// - Feedback inmediato: beep + vibración + destello verde al leer.
// - Modo continuo (POS: sigue leyendo) o de una sola lectura (catálogo).
// Funciona en iPhone (Safari) y Android (Chrome) sobre HTTPS. El import es
// dinámico para no romper el SSR de Next.
export function BarcodeScanner({
  onScan,
  continuous = false,
  dedupeMs = 1500,
  className,
}: {
  onScan: (code: string, format: ScanFormat) => void;
  continuous?: boolean;
  dedupeMs?: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  // Confirmación audible: pitido corto vía WebAudio (sin assets externos).
  const beep = useCallback(() => {
    try {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = audioRef.current ?? (audioRef.current = new AudioCtor());
      void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 1180;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // El audio es un extra; nunca debe romper el escaneo.
    }
  }, []);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite usar la cámara. Usa Safari (iPhone) o Chrome (Android) sobre HTTPS.");
      return;
    }
    try {
      const [{ BrowserMultiFormatReader }, lib] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const { DecodeHintType, BarcodeFormat } = lib;

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: dedupeMs,
      });

      const stored = deviceId || (typeof localStorage !== "undefined" ? localStorage.getItem(LS_DEVICE_KEY) ?? "" : "");
      const constraints: MediaStreamConstraints = {
        video: stored
          ? { deviceId: { exact: stored }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      setScanning(true);
      const controls = (await reader.decodeFromConstraints(constraints, videoRef.current!, (result) => {
        if (!result) return;
        const code = result.getText();
        const now = Date.now();
        if (code === last.current.code && now - last.current.at < dedupeMs) return;
        last.current = { code, at: now };

        const fmt = FORMAT_TO_TYPE[result.getBarcodeFormat()] ?? "OTHER";
        beep();
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
        setLastCode(code);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 180);

        onScan(code, fmt);
        if (!continuous) stop();
      })) as ScannerControls;
      controlsRef.current = controls;
      setTorchAvailable(typeof controls.switchTorch === "function");

      // Enumera cámaras (ya con permiso concedido → devuelve etiquetas legibles).
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        setDevices(list);
        if (!stored && list.length > 0) setDeviceId(list[0]!.deviceId);
      } catch {
        // La lista es un extra; el escaneo ya está corriendo.
      }
    } catch (e) {
      setScanning(false);
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Permiso de cámara denegado. Actívalo en los ajustes del navegador y reintenta.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("No se encontró una cámara disponible. Revisa el equipo o teclea el código.");
      } else {
        setError("No se pudo abrir la cámara. Da permiso, usa HTTPS o teclea el código.");
      }
    }
  }, [beep, continuous, dedupeMs, deviceId, onScan, stop]);

  const toggleTorch = useCallback(async () => {
    const ctl = controlsRef.current;
    if (!ctl?.switchTorch) return;
    try {
      const next = !torchOn;
      await ctl.switchTorch(next);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  const switchCamera = useCallback(
    async (id: string) => {
      setDeviceId(id);
      if (typeof localStorage !== "undefined") localStorage.setItem(LS_DEVICE_KEY, id);
      if (scanning) {
        stop();
        // Espera a que el ref quede libre antes de reabrir con la nueva cámara.
        window.setTimeout(() => void start(), 150);
      }
    },
    [scanning, start, stop]
  );

  useEffect(() => () => stop(), [stop]);

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="relative overflow-hidden rounded-xl bg-gray-900" style={{ aspectRatio: "4 / 3" }}>
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

        {/* Retícula de encuadre + línea de barrido animada */}
        {scanning && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-24 w-4/5 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-brand/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              <span className="absolute left-0 right-0 top-0 h-0.5 animate-[scanline_1.6s_ease-in-out_infinite] bg-brand" />
            </div>
          </div>
        )}

        {/* Destello de confirmación al leer */}
        {flash && <div className="pointer-events-none absolute inset-0 bg-green-400/40" />}

        {!scanning && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-gray-400">
            <span className="flex flex-col items-center gap-1">
              <ScanLine className="h-6 w-6 text-gray-500" />
              Toca “Escanear” y apunta al código de barras
            </span>
          </div>
        )}

        {/* Linterna sobre el video */}
        {scanning && torchAvailable && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
            aria-label={torchOn ? "Apagar linterna" : "Encender linterna"}
          >
            {torchOn ? <Zap className="h-4 w-4 text-amber-300" /> : <ZapOff className="h-4 w-4" />}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {scanning ? (
          <Button size="sm" variant="outline" type="button" onClick={stop}>
            <CameraOff className="h-4 w-4" /> Detener
          </Button>
        ) : (
          <Button size="sm" variant="outline" type="button" onClick={() => void start()}>
            <Camera className="h-4 w-4" /> Escanear con cámara
          </Button>
        )}

        {scanning && devices.length > 1 && (
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <SwitchCamera className="h-4 w-4" />
            <select
              value={deviceId}
              onChange={(e) => void switchCamera(e.target.value)}
              className="max-w-[10rem] rounded border border-gray-200 bg-white px-1.5 py-1 text-xs"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Cámara ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}

        {lastCode && <span className="ml-auto font-mono text-xs text-gray-400">Último: {lastCode}</span>}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
