/** @type {import('next').NextConfig} */

// La API se consume por MISMO ORIGEN vía proxy (rewrite) para que la cookie de sesión
// sea de primera parte y funcione en móvil (iOS Safari bloquea cookies cross-site).
// En dev apunta al API local; en producción, al despliegue de la API.
const API_ORIGIN =
  process.env.API_ORIGIN ||
  (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "https://24-hits-os-api.vercel.app");

// Cabeceras de seguridad. Nota: Permissions-Policy permite la cámara en el mismo
// origen porque el POS escanea códigos de barras con getUserMedia.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // geolocation=(self): el repartidor necesita GPS en Ruta de hoy / navegación.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig = {
  reactStrictMode: true,
  // Los paquetes internos se consumen como fuente y los transpila Next.
  // maplibre-gl: transpilado para que Next resuelva su Web Worker (si no, los
  // tiles vectoriales no se renderizan y solo se ve el fondo).
  transpilePackages: ["@24hits/ui", "@24hits/contracts", "maplibre-gl"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
