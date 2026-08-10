"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@24hits/ui";
import { useMe } from "@/lib/me";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, isLoading, isError } = useMe();

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
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header me={me} />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
