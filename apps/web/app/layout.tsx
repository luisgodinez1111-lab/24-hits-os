import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OfflineSync } from "@/components/OfflineSync";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#7c3aed" },
    { media: "(prefers-color-scheme: dark)", color: "#141018" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // Necesario para que env(safe-area-inset-*) sea distinto de 0 en iPhone con notch.
  viewportFit: "cover",
};

// Aplica el tema antes del primer paint (sin parpadeo): preferencia guardada o
// la del sistema.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={manrope.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <OfflineBanner />
        <Providers>{children}</Providers>
        <OfflineSync />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
