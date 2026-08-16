import type { Config } from "tailwindcss";

// Neutrales remapeados a variables CSS (definidas en globals.css) para soportar
// modo oscuro sin tocar las clases existentes (bg-white, text-gray-500, …).
const gray = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, `rgb(var(--c-gray-${n}) / <alpha-value>)`])
);

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
        gray,
        brand: {
          DEFAULT: "#7c3aed",
          dark: "#5b21b6",
        },
      },
    },
  },
  plugins: [],
};

export default config;
