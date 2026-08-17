"use client";

import { useEffect } from "react";

// Último recurso: captura errores del propio layout raíz. Reemplaza todo el
// documento, así que va autocontenido con estilos inline (no depende del CSS).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#f9fafb", color: "#111827" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Algo salió mal</h1>
          <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 360 }}>Ocurrió un error inesperado. Reintenta o recarga la página.</p>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: 11, color: "#9ca3af" }}>Ref: {error.digest}</p>}
          <button
            onClick={reset}
            style={{ marginTop: 4, background: "#7c3aed", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
