"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@24hits/ui";
import { hasPermission, useMe } from "@/lib/me";
import { settingsTabs } from "@/lib/settings-tabs";

// Índice de Configuración: redirige a la primera pestaña que el usuario pueda ver.
export default function SettingsIndexPage() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();

  useEffect(() => {
    if (isLoading) return;
    const first = settingsTabs.find((t) => !t.perm || hasPermission(me, t.perm)) ?? settingsTabs[settingsTabs.length - 1]!;
    router.replace(first.href);
  }, [isLoading, me, router]);

  return <Skeleton className="h-64 w-full" />;
}
