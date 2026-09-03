"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@24hits/ui";
import { useMe } from "@/lib/me";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { CommandPalette } from "@/components/CommandPalette";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, isLoading, isError } = useMe();
  const [navOpen, setNavOpen] = useState(false);

  // Cierra el cajón móvil al cambiar de ruta.
  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    if (isError) {
      router.replace("/login");
      return;
    }
    // Autenticado pero sin organización activa → forzar selección.
    if (me && !me.organizationId && pathname !== "/app/select-organization") {
      router.replace("/app/select-organization");
    }
  }, [me, isError, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="text-brand" />
      </div>
    );
  }
  if (isError) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header me={me} onMenu={() => setNavOpen(true)} />
        <VerifyEmailBanner />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
