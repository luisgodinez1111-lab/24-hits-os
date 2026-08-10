"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import {
  Badge, Button, EmptyState, Skeleton, Table, TBody, TD, TH, THead, TR,
} from "@24hits/ui";
import type { MovementPage } from "@/lib/catalog-types";
import { api } from "@/lib/api";

const dirTone: Record<string, "green" | "red" | "gray"> = { IN: "green", OUT: "red", NEUTRAL: "gray" };

export default function MovementsPage() {
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["movements", cursor],
    queryFn: () => api.get<MovementPage>(`/inventory/movements?limit=50${cursor ? `&cursor=${cursor}` : ""}`),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Movimientos de inventario</h1>
      <p className="mb-6 text-sm text-gray-500">Ledger inmutable (solo lectura)</p>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight className="h-8 w-8 text-gray-400" />} title="Sin movimientos" />
      ) : (
        <>
          <Table>
            <THead>
              <TR><TH>Fecha</TH><TH>Tipo</TH><TH>Dir.</TH><TH className="text-right">Cantidad</TH><TH>Motivo</TH><TH>Correlation</TH></TR>
            </THead>
            <TBody>
              {data.items.map((m) => (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap text-gray-500">{new Date(m.createdAt).toLocaleString("es-MX")}</TD>
                  <TD><Badge tone="gray">{m.movementType}</Badge></TD>
                  <TD><Badge tone={dirTone[m.direction] ?? "gray"}>{m.direction}</Badge></TD>
                  <TD className="text-right font-semibold">{m.quantity}</TD>
                  <TD className="text-gray-500">{m.reasonCode ?? "—"}</TD>
                  <TD className="font-mono text-xs text-gray-400">{m.correlationId ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {data.nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" loading={isFetching} onClick={() => setCursor(data.nextCursor)}>Cargar más</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
