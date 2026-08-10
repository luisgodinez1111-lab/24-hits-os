/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Los paquetes internos se consumen como fuente y los transpila Next.
  transpilePackages: ["@24hits/ui", "@24hits/contracts"],
};

export default nextConfig;
