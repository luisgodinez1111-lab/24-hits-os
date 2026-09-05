"use client";

import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar, Truck } from "lucide-react";
import { Badge, EmptyState, Skeleton, useToast } from "@24hits/ui";
import type { LiveTracking } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";

const TrackingMap = dynamic(() => import("@/components/TrackingMap").then((m) => m.TrackingMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[60vh] w-full" />,
});

const zoneLabel: Record<string, string> = { NORTE: "Norte", SUR: "Sur", ESTE: "Este", OESTE: "Oeste", CENTRO: "Centro" };

export default function TrackingPage() {
  const qc = useQueryClient();
  const toast = useToast();
  // Poll cada 5 s: casi tiempo real, robusto en serverless.
  const { data, isLoading } = useQuery({
    queryKey: ["delivery-live"],
    queryFn: () => api.get<LiveTracking>("/delivery/live"),
    refetchInterval: 5000,
  });

  // Dispatch: asigna/reasigna una parada a un repartidor (o al pool con null).
  const assign = useMutation({
    mutationFn: ({ orderId, driverId }: { orderId: string; driverId: string | null }) =>
      api.patch(`/orders/${orderId}/assign`, { driverId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["delivery-live"] }),
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "No se pudo asignar la entrega", "error"),
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

          {/* DISPATCH: reparte las paradas entre repartidores. Sin asignar = pool común
              (lo ve cualquier repartidor en su ruta). Asignada = solo la ve ese repartidor. */}
          {stops.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Reparto ({stops.length}) — asigna cada entrega a un repartidor
              </p>
              <ul className="space-y-2">
                {stops.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{s.customer?.name ?? "Mostrador"}</span>
                        {s.customer?.zone && <Badge tone="gray">{zoneLabel[s.customer.zone] ?? s.customer.zone}</Badge>}
                        {s.assignedDriverName ? (
                          <Badge tone="blue">{s.assignedDriverName}</Badge>
                        ) : (
                          <Badge tone="amber">Sin asignar</Badge>
                        )}
                      </div>
                      <p className="truncate text-sm text-gray-500">{s.deliveryAddress ?? "Sin dirección"}</p>
                      <p className="font-mono text-xs text-gray-400">{s.number} · {money(s.total)}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-500">
                      Repartidor
                      <select
                        value={s.assignedDriverId ?? ""}
                        onChange={(e) => assign.mutate({ orderId: s.id, driverId: e.target.value || null })}
                        disabled={assign.isPending}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-50"
                      >
                        <option value="">Sin asignar</option>
                        {drivers.map((d) => (
                          <option key={d.userId} value={d.userId}>{d.name}</option>
                        ))}
                        {/* Asignada a un repartidor que ahora está fuera de línea: se conserva. */}
                        {s.assignedDriverId && !drivers.some((d) => d.userId === s.assignedDriverId) && (
                          <option value={s.assignedDriverId}>{s.assignedDriverName ?? "Asignado (fuera de línea)"}</option>
                        )}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
