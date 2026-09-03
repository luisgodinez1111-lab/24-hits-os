"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Tooltip } from "@24hits/ui";

// Alterna claro/oscuro y lo persiste. El estado inicial lo aplica el script
// inline del layout (sin parpadeo); aquí solo leemos y alternamos.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage puede fallar (modo privado); el tema igual cambia en memoria.
    }
  }

  const label = dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="grid h-9 w-9 place-items-center rounded-lg text-gray-600 outline-none transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-brand"
      >
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
    </Tooltip>
  );
}
