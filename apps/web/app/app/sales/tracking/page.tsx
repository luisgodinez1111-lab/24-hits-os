"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Radar, Truck } from "lucide-react";
import { Badge, EmptyState, Skeleton } from "@24hits/ui";
import type { LiveTracking } from "@/lib/catalog-types";
import { api } from "@/lib/api";

const TrackingMap = dynamic(() => import("@/components/TrackingMap").then((m) => m.TrackingMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[60vh] w-full" />,
});

export default function TrackingPage() {
  // Poll cada 5 s: casi tiempo real, robusto en serverless.
  const { data, isLoading } = useQuery({
    queryKey: ["delivery-live"],
    queryFn: () => api.get<LiveTracking>("/delivery/live"),
    refetchInterval: 5000,
  });

  const drivers = data?.drivers ?? [];
  const stops = data?.stops ?? [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Radar className="h-6 w-6" /> Seguimiento en vivo</h1>
        <p className="text-sm text-gray-500">
          {drivers.length} repartidor{drivers.length === 1 ? "" : "es"} activo{drivers.length === 1 ? "" : "s"} · {stops.length} entregas pendientes · actualiza cada 5 s
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-[60vh] w-full" />
      ) : (
        <div className="space-y-4">
          <TrackingMap drivers={drivers} stops={stops} />

          {drivers.length === 0 ? (
            <EmptyState icon={<Truck className="h-8 w-8 text-gray-400" />} title="Ningún repartidor en línea" description="Aparecerán aquí cuando abran la Ruta de hoy con el GPS activado." />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {drivers.map((d) => (
                <div key={d.userId} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700"><Truck className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{d.name}</p>
                    <p className="text-xs text-gray-400">
                      {d.minutesAgo === 0 ? "en línea ahora" : `hace ${d.minutesAgo} min`}
                    </p>
                  </div>
                  <Badge tone={d.minutesAgo <= 1 ? "green" : "amber"} className="ml-auto">{d.minutesAgo <= 1 ? "activo" : "inactivo"}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
