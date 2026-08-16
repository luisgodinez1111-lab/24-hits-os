import type { Config } from "tailwindcss";

const config: Config = {
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
