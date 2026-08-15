"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@24hits/ui";
import { hasPermission, useMe } from "@/lib/me";
import { catalogTabs } from "@/lib/catalog-tabs";

// Índice de Catálogo: redirige a la primera pestaña accesible.
export default function CatalogIndexPage() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (isLoading) return;
    const first = catalogTabs.find((t) => !t.perm || hasPermission(me, t.perm)) ?? catalogTabs[0]!;
    router.replace(first.href);
  }, [isLoading, me, router]);

  return <Skeleton className="h-64 w-full" />;
}
