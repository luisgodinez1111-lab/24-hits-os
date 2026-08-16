"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

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

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="grid h-9 w-9 place-items-center rounded-lg text-gray-600 hover:bg-gray-100"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
