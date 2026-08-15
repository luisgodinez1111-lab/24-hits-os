"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@24hits/ui";
import { hasPermission, useMe } from "@/lib/me";
import { purchasingTabs } from "@/lib/purchasing-tabs";

// Índice de Compras: redirige a la primera pestaña accesible.
export default function PurchasingIndexPage() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (isLoading) return;
    const first = purchasingTabs.find((t) => !t.perm || hasPermission(me, t.perm)) ?? purchasingTabs[0]!;
    router.replace(first.href);
  }, [isLoading, me, router]);

  return <Skeleton className="h-64 w-full" />;
}
