"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@24hits/ui";

// La tabla plana de Modelos se unificó con el árbol Marca → Modelo → Sabor: hay UNA
// sola vista del catálogo. Esta ruta antigua redirige ahí (enlaces/bookmarks siguen
// funcionando). Ver lib/catalog-tabs.ts.
export default function ProductsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/app/catalog/attributes"); }, [router]);
  return <Skeleton className="h-64 w-full" />;
}
