"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crosshair, MapPin, Navigation, Phone, Route as RouteIcon } from "lucide-react";
import { Badge, Button, EmptyState, Skeleton, useToast } from "@24hits/ui";
import type { CustomerZone, DeliveryStop } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";

const zoneLabel: Record<CustomerZone, string> = { NORTE: "Norte", SUR: "Sur", ESTE: "Este", OESTE: "Oeste", CENTRO: "Centro" };

type LatLng = { lat: number; lng: number };

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Navegación paso a paso: Apple Maps en iPhone/iPad, Google Maps en el resto.
function navUrl(stop: DeliveryStop): string | null {
  if (stop.deliveryLat != null && stop.deliveryLng != null) {
    const dest = `${stop.deliveryLat},${stop.deliveryLng}`;
    const isIOS = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);
    return isIOS ? `https://maps.apple.com/?daddr=${dest}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  }
  return stop.deliveryLocationUrl || null;
}

interface Leg { stop: DeliveryStop; km: number | null }

// Ordena por vecino más cercano desde `start`; los pedidos sin coordenadas van al
// final (agrupados por zona). Devuelve cada parada con la distancia al anterior.
function buildRoute(stops: DeliveryStop[], start: LatLng | null): { legs: Leg[]; noCoords: DeliveryStop[]; totalKm: number } {
  const withCoords = stops.filter((s): s is DeliveryStop & { deliveryLat: number; deliveryLng: number } => s.deliveryLat != null && s.deliveryLng != null);
  const noCoords = stops.filter((s) => s.deliveryLat == null || s.deliveryLng == null);

  const legs: Leg[] = [];
  const remaining = [...withCoords];
  let cur: LatLng | null = start ?? (withCoords[0] ? { lat: withCoords[0].deliveryLat, lng: withCoords[0].deliveryLng } : null);
  let totalKm = 0;

  while (remaining.length > 0 && cur) {
    let bestIdx = 0;
    let bestKm = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cur, { lat: remaining[i]!.deliveryLat, lng: remaining[i]!.deliveryLng });
      if (d < bestKm) { bestKm = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    legs.push({ stop: next, km: legs.length === 0 && !start ? null : bestKm });
    totalKm += legs.length === 0 && !start ? 0 : bestKm;
    cur = { lat: next.deliveryLat, lng: next.deliveryLng };
  }

  return { legs, noCoords, totalKm };
}

export default function RoutePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [pos, setPos] = useState<LatLng | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  const { data: stops, isLoading } = useQuery({ queryKey: ["pending-deliveries"], queryFn: () => api.get<DeliveryStop[]>("/orders/pending-deliveries") });

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

  const route = useMemo(() => buildRoute(stops ?? [], pos), [stops, pos]);

  const deliver = useMutation({
    mutationFn: (id: string) => api.patch(`/orders/${id}/delivery`, { status: "DELIVERED" }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["pending-deliveries"] }); toast.push("Entregado ✓", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><RouteIcon className="h-6 w-6" /> Ruta de hoy</h1>
          <p className="text-sm text-gray-500">
            {stops?.length ?? 0} entregas pendientes{route.totalKm > 0 ? ` · ~${route.totalKm.toFixed(1)} km` : ""} · orden por cercanía
          </p>
        </div>
        <Button variant="outline" onClick={locate}><Crosshair className="h-4 w-4" /> Mi ubicación</Button>
      </div>

      {geoMsg && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{geoMsg}</p>}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (stops?.length ?? 0) === 0 ? (
        <EmptyState icon={<MapPin className="h-8 w-8 text-gray-400" />} title="Sin entregas pendientes" description="Cuando haya pedidos por enviar, aparecerán aquí en orden de cercanía." />
      ) : (
        <ol className="space-y-2">
          {route.legs.map((leg, i) => (
            <Stop key={leg.stop.id} n={i + 1} leg={leg} next={i === 0} onDeliver={() => deliver.mutate(leg.stop.id)} delivering={deliver.isPending} />
          ))}
          {route.noCoords.length > 0 && (
            <li className="pt-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Sin ubicación (ponles el pin de Maps)</p>
              <div className="space-y-2">
                {route.noCoords.map((s) => (
                  <Stop key={s.id} n={null} leg={{ stop: s, km: null }} next={false} onDeliver={() => deliver.mutate(s.id)} delivering={deliver.isPending} />
                ))}
              </div>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

function Stop({ n, leg, next, onDeliver, delivering }: { n: number | null; leg: Leg; next: boolean; onDeliver: () => void; delivering: boolean }) {
  const s = leg.stop;
  const nav = navUrl(s);
  const phone = s.deliveryPhone || s.customer?.phone || null;
  return (
    <div className={`rounded-xl border p-3 ${next ? "border-brand/40 bg-brand/5" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${next ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}>{n ?? "–"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{s.customer?.name ?? "Mostrador"}</span>
            {next && <Badge tone="brand">siguiente</Badge>}
            {s.customer?.zone && <Badge tone="gray">{zoneLabel[s.customer.zone]}</Badge>}
            {leg.km != null && <span className="ml-auto text-xs font-medium text-gray-500">{leg.km.toFixed(1)} km</span>}
          </div>
          <p className="truncate text-sm text-gray-500">{s.deliveryAddress ?? "Sin dirección"}</p>
          <p className="text-xs text-gray-400 font-mono">{s.number} · {money(s.total)}{s.deliveryNotes ? ` · ${s.deliveryNotes}` : ""}</p>
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
