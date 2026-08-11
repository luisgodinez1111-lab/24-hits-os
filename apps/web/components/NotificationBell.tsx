"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Check, Info } from "lucide-react";
import { Badge, Button, Dialog, EmptyState } from "@24hits/ui";
import type { AppNotification } from "@/lib/catalog-types";
import { api } from "@/lib/api";

const severityIcon = {
  CRITICAL: <AlertTriangle className="h-4 w-4 text-red-500" />,
  WARNING: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  INFO: <Info className="h-4 w-4 text-blue-500" />,
} as const;

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Contador de no leídas: refresco periódico.
  const { data: unread } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count").catch(() => ({ count: 0 })),
    refetchInterval: 60_000,
  });
  const { data: list } = useQuery({
    queryKey: ["notifications"], enabled: open,
    queryFn: () => api.get<AppNotification[]>("/notifications"),
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["notifications"] }),
      qc.invalidateQueries({ queryKey: ["notifications-unread"] }),
    ]);
  };
  const markRead = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api.post("/notifications/read-all"), onSuccess: refresh });

  const count = unread?.count ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
        aria-label="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Notificaciones"
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cerrar</Button>
          <Button size="sm" loading={markAll.isPending} onClick={() => markAll.mutate()}><Check className="h-4 w-4" /> Marcar todo leído</Button>
        </>}>
        {!list || list.length === 0 ? (
          <EmptyState icon={<Bell className="h-8 w-8 text-gray-400" />} title="Sin notificaciones" />
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {list.map((n) => (
              <div key={n.id} className={`flex items-start gap-3 rounded-lg border p-3 ${n.readAt ? "border-gray-200 bg-white" : "border-brand/30 bg-brand/5"}`}>
                <div className="mt-0.5">{severityIcon[n.severity]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                    {!n.readAt && <Badge tone="brand">Nuevo</Badge>}
                  </div>
                  <p className="text-sm text-gray-600">{n.body}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{new Date(n.createdAt).toLocaleString("es-MX")}</p>
                </div>
                {!n.readAt && (
                  <button onClick={() => markRead.mutate(n.id)} className="text-gray-400 hover:text-brand" aria-label="Marcar leída">
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </>
  );
}
