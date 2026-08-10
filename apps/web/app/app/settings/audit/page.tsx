"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import {
  Badge,
  EmptyState,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Button,
} from "@24hits/ui";
import type { AuditPage } from "@24hits/contracts";
import { api } from "@/lib/api";

export default function AuditPageView() {
  const [cursor, setCursor] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit", cursor],
    queryFn: () =>
      api.get<AuditPage>(`/audit/events?limit=50${cursor ? `&cursor=${cursor}` : ""}`),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Auditoría</h1>
      <p className="mb-6 text-sm text-gray-500">
        Registro inmutable de acciones (append-only)
      </p>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-8 w-8 text-gray-400" />}
          title="Sin eventos de auditoría"
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Acción</TH>
                <TH>Entidad</TH>
                <TH>Correlation ID</TH>
              </TR>
            </THead>
            <TBody>
              {data.items.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap text-gray-500">
                    {new Date(e.createdAt).toLocaleString("es-MX")}
                  </TD>
                  <TD>
                    <Badge tone="gray">{e.action}</Badge>
                  </TD>
                  <TD className="text-gray-500">
                    {e.entityType ? `${e.entityType}` : "—"}
                  </TD>
                  <TD className="font-mono text-xs text-gray-400">
                    {e.correlationId ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {data.nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                loading={isFetching}
                onClick={() => setCursor(data.nextCursor)}
              >
                Cargar más
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
