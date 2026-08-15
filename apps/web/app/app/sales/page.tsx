"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@24hits/ui";
import { hasPermission, useMe } from "@/lib/me";
import { salesTabs } from "@/lib/sales-tabs";

// Índice de Ventas: redirige a la primera pestaña accesible.
export default function SalesIndexPage() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (isLoading) return;
    const first = salesTabs.find((t) => !t.perm || hasPermission(me, t.perm)) ?? salesTabs[0]!;
    router.replace(first.href);
  }, [isLoading, me, router]);

  return <Skeleton className="h-64 w-full" />;
}
