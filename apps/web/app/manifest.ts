import type { MetadataRoute } from "next";

// Manifest PWA: permite "instalar" la app en el celular (el POS se usa en móvil
// para escanear). Arranca en /app en modo standalone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "24 HITS OS",
    short_name: "24 HITS",
    description: "Ventas, inventario, clientes y analítica",
    start_url: "/app",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    lang: "es",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}
