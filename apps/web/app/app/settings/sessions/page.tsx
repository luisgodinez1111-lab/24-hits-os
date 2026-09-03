"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  EmptyState,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
  PageHeader,
} from "@24hits/ui";
import { Monitor } from "lucide-react";
import type { SessionInfo } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";

export default function SessionsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<SessionInfo[]>("/auth/sessions"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/auth/sessions/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.push("Sesión revocada", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <PageHeader title="Sesiones activas" subtitle="Dispositivos con acceso a tu cuenta" />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState
          icon={<Monitor className="h-8 w-8 text-gray-400" />}
          title="Sin sesiones activas"
        />
      ) : (
        <Table stickyHeader>
          <THead>
            <TR>
              <TH>Dispositivo / Navegador</TH>
              <TH>IP</TH>
              <TH>Último uso</TH>
              <TH className="text-right">Acción</TH>
            </TR>
          </THead>
          <TBody>
            {sessions.map((s) => (
              <TR key={s.id}>
                <TD className="max-w-xs truncate text-gray-700">{s.userAgent ?? "—"}</TD>
                <TD className="font-mono text-xs">{s.ip ?? "—"}</TD>
                <TD className="text-gray-500">
                  {new Date(s.lastUsedAt).toLocaleString("es-MX")}
                </TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="danger"
                    loading={revoke.isPending}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    Revocar
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
