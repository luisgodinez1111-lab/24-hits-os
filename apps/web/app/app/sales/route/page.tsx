"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crosshair, MapPin, Navigation, Phone, Route as RouteIcon } from "lucide-react";
import { Badge, Button, EmptyState, Skeleton, useToast } from "@24hits/ui";
import type { CustomerZone, OptimizedRoute, OptimizedStop } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { navUrl, type LatLng, type Leg } from "@/lib/route";

// El mapa solo en cliente (Leaflet usa window).
const RouteMap = dynamic(() => import("@/components/RouteMap").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[56vh] w-full" />,
});

const zoneLabel: Record<CustomerZone, string> = { NORTE: "Norte", SUR: "Sur", ESTE: "Este", OESTE: "Oeste", CENTRO: "Centro" };

export default function RoutePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [pos, setPos] = useState<LatLng | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  // El backend optimiza la ruta (vecino más cercano + 2-opt) desde tu posición.
  const { data: route, isLoading } = useQuery({
    queryKey: ["route", pos?.lat ?? null, pos?.lng ?? null],
    queryFn: () => api.get<OptimizedRoute>(`/orders/route${pos ? `?lat=${pos.lat}&lng=${pos.lng}` : ""}`),
  });

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGeoMsg("Este dispositivo no permite ubicación."); return; }
    setGeoMsg("Obteniendo tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGeoMsg(null); },
      () => setGeoMsg("Sin permiso de ubicación: la ruta arranca desde el primer pedido."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => { locate(); }, [locate]);

  const deliver = useMutation({
    mutationFn: (id: string) => api.patch(`/orders/${id}/delivery`, { status: "DELIVERED" }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["route"] }); toast.push("Entregado ✓", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  const stops: OptimizedStop[] = route?.stops ?? [];
  const legs: Leg[] = stops.map((s) => ({ stop: s, km: s.legKm }));
  const noCoords = route?.noCoords ?? [];
  const total = stops.length + noCoords.length;
  const providerLabel = route?.provider === "osrm" ? "por calles" : route?.provider === "haversine" ? "línea recta" : "";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><RouteIcon className="h-6 w-6" /> Ruta de hoy</h1>
          <p className="text-sm text-gray-500">
            {total} entregas{route && route.totalKm > 0 ? ` · ~${route.totalKm.toFixed(1)} km` : ""}
            {route?.totalMin != null ? ` · ~${route.totalMin} min` : ""}
            {providerLabel ? ` · ruta ${providerLabel}, orden óptimo` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={locate}><Crosshair className="h-4 w-4" /> Mi ubicación</Button>
      </div>

      {geoMsg && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{geoMsg}</p>}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : total === 0 ? (
        <EmptyState icon={<MapPin className="h-8 w-8 text-gray-400" />} title="Sin entregas pendientes" description="Cuando haya pedidos por enviar, aparecerán aquí en la ruta más eficiente." />
      ) : (
        <div className="space-y-4">
          {legs.length > 0 && <RouteMap legs={legs} driver={pos} />}

          <ol className="space-y-2">
            {stops.map((s, i) => (
              <Stop key={s.id} n={i + 1} stop={s} next={i === 0} onDeliver={() => deliver.mutate(s.id)} delivering={deliver.isPending} />
            ))}
            {noCoords.length > 0 && (
              <li className="pt-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Sin ubicación en el mapa (pídeles el pin)</p>
                <div className="space-y-2">
                  {noCoords.map((s) => (
                    <Stop key={s.id} n={null} stop={{ ...s, legKm: null, legMin: null }} next={false} onDeliver={() => deliver.mutate(s.id)} delivering={deliver.isPending} />
                  ))}
                </div>
              </li>
            )}
          </ol>
        </div>
      )}
    </div>
  );
}

function Stop({ n, stop, next, onDeliver, delivering }: { n: number | null; stop: OptimizedStop; next: boolean; onDeliver: () => void; delivering: boolean }) {
  const nav = navUrl(stop);
  const phone = stop.deliveryPhone || stop.customer?.phone || null;
  return (
    <div className={`rounded-xl border p-3 ${next ? "border-brand/40 bg-brand/5" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${next ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}>{n ?? "–"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{stop.customer?.name ?? "Mostrador"}</span>
            {next && <Badge tone="brand">siguiente</Badge>}
            {stop.customer?.zone && <Badge tone="gray">{zoneLabel[stop.customer.zone]}</Badge>}
            {stop.legKm != null && (
              <span className="ml-auto text-xs font-medium text-gray-500">
                {stop.legKm.toFixed(1)} km{stop.legMin != null ? ` · ${stop.legMin} min` : ""}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-gray-500">{stop.deliveryAddress ?? "Sin dirección"}</p>
          <p className="font-mono text-xs text-gray-400">{stop.number} · {money(stop.total)}{stop.deliveryNotes ? ` · ${stop.deliveryNotes}` : ""}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {nav && <a href={nav} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"><Navigation className="h-4 w-4" /> Navegar</a>}
        {phone && <a href={`tel:${phone}`} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"><Phone className="h-4 w-4" /> Llamar</a>}
        <Button size="sm" variant="outline" loading={delivering} onClick={onDeliver}><Check className="h-4 w-4" /> Entregado</Button>
      </div>
    </div>
  );
}
