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
  // Versión del build expuesta al cliente para auto-actualizar el service worker en
  // cada deploy (ver components/ServiceWorkerRegistrar.tsx). En Vercel es el commit;
  // en su defecto, el timestamp del build (cambia en cada rebuild real).
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()),
  },
  // Los paquetes internos se consumen como fuente y los transpila Next.
  // (maplibre-gl se carga por CDN en runtime; aquí solo se usa para tipos.)
  transpilePackages: ["@24hits/ui", "@24hits/contracts"],
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
