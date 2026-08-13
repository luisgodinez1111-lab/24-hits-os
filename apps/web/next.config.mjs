/** @type {import('next').NextConfig} */

// La API se consume por MISMO ORIGEN vía proxy (rewrite) para que la cookie de sesión
// sea de primera parte y funcione en móvil (iOS Safari bloquea cookies cross-site).
// En dev apunta al API local; en producción, al despliegue de la API.
const API_ORIGIN =
  process.env.API_ORIGIN ||
  (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "https://24-hits-os-api.vercel.app");

const nextConfig = {
  reactStrictMode: true,
  // Los paquetes internos se consumen como fuente y los transpila Next.
  transpilePackages: ["@24hits/ui", "@24hits/contracts"],
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
