"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// Frontera de error de la app: captura fallos de render en las rutas y muestra
// una pantalla amable con reintento, sin filtrar detalles internos.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-red-100 text-red-700">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold text-gray-900">Algo salió mal</h1>
      <p className="max-w-sm text-sm text-gray-500">
        Ocurrió un error inesperado. Puedes reintentar o volver al inicio; si persiste, comparte la referencia.
      </p>
      {error.digest && <p className="font-mono text-[11px] text-gray-400">Ref: {error.digest}</p>}
      <div className="mt-1 flex gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
        >
          Reintentar
        </button>
        <Link
          href="/app"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          Inicio
        </Link>
      </div>
    </div>
  );
}
