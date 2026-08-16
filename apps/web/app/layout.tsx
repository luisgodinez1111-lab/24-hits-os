import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Tipografía self-hosted (next/font descarga en build y sirve local → sin CDN,
// compatible con CSP). Manrope: sans moderna con buenas cifras para tablas.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "24 HITS OS", template: "%s · 24 HITS OS" },
  description: "Ventas, inventario, clientes y analítica — 24 HITS OS",
  applicationName: "24 HITS OS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "24 HITS", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={manrope.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
