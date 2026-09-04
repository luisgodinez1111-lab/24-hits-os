import type { Config } from "tailwindcss";

// Neutrales remapeados a variables CSS (definidas en globals.css) para soportar
// modo oscuro sin tocar las clases existentes (bg-white, text-gray-500, …).
const gray = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, `rgb(var(--c-gray-${n}) / <alpha-value>)`])
);

// Semánticos: solo los shades de "chip" (50/100/200/700/800). Los medios
// (300–600) se quedan crudos (Tailwind) porque se leen en claro y oscuro.
const semantic = (name: string) =>
  Object.fromEntries([50, 100, 200, 700, 800].map((n) => [n, `rgb(var(--c-${name}-${n}) / <alpha-value>)`]));

// Marca (violeta) como rampa completa desde tokens → se adapta a claro/oscuro.
const brand = {
  DEFAULT: "rgb(var(--c-brand-600) / <alpha-value>)",
  dark: "rgb(var(--c-brand-800) / <alpha-value>)", // compat: hover:bg-brand-dark
  ...Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, `rgb(var(--c-brand-${n}) / <alpha-value>)`])
  ),
};

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    // El design system vive en otro paquete; hay que escanearlo también.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        white: "rgb(var(--c-white) / <alpha-value>)",
        raised: "rgb(var(--c-raised) / <alpha-value>)", // superficie elevada (bg-raised): = white en claro, más clara en oscuro
        gray,
        green: semantic("green"),
        amber: semantic("amber"),
        red: semantic("red"),
        blue: semantic("blue"),
        brand,
      },
      // Rampa tipográfica semántica (estilo "text styles" de Apple). Aditiva: no
      // pisa text-xs…text-9xl. Títulos con tracking negativo; cuerpo con medida cómoda.
      fontSize: {
        display: ["2rem", { lineHeight: "2.25rem", letterSpacing: "-0.021em", fontWeight: "700" }],
        title: ["1.5rem", { lineHeight: "1.85rem", letterSpacing: "-0.017em", fontWeight: "700" }],
        headline: ["1.125rem", { lineHeight: "1.55rem", letterSpacing: "-0.011em", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.45rem", letterSpacing: "-0.006em" }],
        callout: ["0.875rem", { lineHeight: "1.35rem" }],
        caption: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.004em" }],
      },
      // Radios por rol (aditivos): control (botón/input), card, sheet (hojas/diálogos).
      borderRadius: {
        control: "0.625rem", // 10px
        card: "0.875rem", // 14px
        sheet: "1.25rem", // 20px
      },
      // Elevación tokenizada (aditiva: no pisa shadow-sm/md/lg/xl de Tailwind).
      boxShadow: {
        xs: "var(--shadow-xs)",
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        overlay: "var(--shadow-overlay)",
      },
      // Movimiento desde tokens.
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        emphasized: "var(--ease-emphasized)",
        spring: "var(--ease-spring)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        "slide-up-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-down-in": { from: { opacity: "0", transform: "translateY(-6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "toast-in": { from: { opacity: "0", transform: "translateX(16px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "toast-out": { from: { opacity: "1", transform: "translateX(0)" }, to: { opacity: "0", transform: "translateX(16px)" } },
      },
      animation: {
        "fade-in": "fade-in var(--dur-base) var(--ease-standard)",
        "scale-in": "scale-in var(--dur-base) var(--ease-emphasized)",
        "slide-up": "slide-up-in var(--dur-base) var(--ease-emphasized)",
        "slide-down": "slide-down-in var(--dur-fast) var(--ease-standard)",
        "slide-in-right": "slide-in-right var(--dur-slow) var(--ease-emphasized)",
        "toast-in": "toast-in var(--dur-base) var(--ease-emphasized)",
        "toast-out": "toast-out var(--dur-fast) var(--ease-standard) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
