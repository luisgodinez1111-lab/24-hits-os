"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Undo2 } from "lucide-react";
import {
  Badge, Button, Dialog, EmptyState, Skeleton,
  Table, TBody, TD, TH, THead, TR,
} from "@24hits/ui";
import type { CreditNote } from "@/lib/catalog-types";
import { api } from "@/lib/api";

const money = (v?: string | null) => (v == null ? "—" : `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const refundLabel: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia", OTHER: "Otro" };

export default function CreditNotesPage() {
  const [viewing, setViewing] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["credit-notes"], queryFn: () => api.get<CreditNote[]>("/credit-notes") });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Notas de crédito</h1>
        <p className="text-sm text-gray-500">Devoluciones — reingreso a inventario y reverso de COGS</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Undo2 className="h-8 w-8 text-gray-400" />} title="Sin notas de crédito" description="Emite una devolución desde una nota de venta." />
      ) : (
        <Table>
          <THead><TR><TH>Folio</TH><TH>Cliente</TH><TH className="text-right">Total</TH><TH>Reembolso</TH><TH>Motivo</TH><TH className="text-right">Acciones</TH></TR></THead>
          <TBody>
            {data.map((n) => (
              <TR key={n.id}>
                <TD className="font-mono text-xs">{n.number}</TD>
                <TD className="font-medium">{n.customerName ?? "Mostrador"}</TD>
                <TD className="text-right">{money(n.total)}</TD>
                <TD>{n.refundMethod ? <Badge tone="blue">{refundLabel[n.refundMethod]}</Badge> : <span className="text-gray-400">—</span>}</TD>
                <TD className="max-w-xs truncate text-gray-500">{n.reason}</TD>
                <TD className="text-right"><Button size="sm" variant="outline" onClick={() => setViewing(n.id)}><Printer className="h-4 w-4" /> Ver</Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <CreditDetailDialog id={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function CreditDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: note } = useQuery({ queryKey: ["credit-note", id], enabled: !!id, queryFn: () => api.get<CreditNote>(`/credit-notes/${id}`) });
  return (
    <Dialog open={!!id} onClose={onClose} title={note ? `Nota de crédito ${note.number}` : "Nota de crédito"}
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Button></>}>
      {!note ? <Skeleton className="h-48 w-full" /> : (
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <div>
              <p className="font-mono font-semibold">{note.number}</p>
              <p className="text-gray-500">{new Date(note.issuedAt).toLocaleString("es-MX")}</p>
            </div>
            <Badge tone="green">{note.status}</Badge>
          </div>
          <p className="font-medium">{note.customerName ?? "Mostrador"}</p>
          <Table>
            <THead><TR><TH>Concepto</TH><TH className="text-right">Cant.</TH><TH className="text-right">P. unit.</TH><TH className="text-right">Importe</TH></TR></THead>
            <TBody>
              {note.items?.map((it) => (
                <TR key={it.id}>
                  <TD>{it.description}{it.sku ? <span className="ml-1 font-mono text-xs text-gray-400">{it.sku}</span> : null}</TD>
                  <TD className="text-right">{Number(it.quantity)}</TD>
                  <TD className="text-right">{money(it.unitPrice)}</TD>
                  <TD className="text-right">{money(it.lineTotal)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="ml-auto w-56 space-y-1 border-t border-gray-200 pt-2">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{money(note.subtotal)}</span></div>
            {Number(note.taxTotal) > 0 && <div className="flex justify-between text-gray-600"><span>Impuestos</span><span>{money(note.taxTotal)}</span></div>}
            <div className="flex justify-between text-base font-bold text-gray-900"><span>Total crédito</span><span>{money(note.total)}</span></div>
            {note.refundMethod && <div className="flex justify-between text-gray-600"><span>Reembolso</span><span>{refundLabel[note.refundMethod]}</span></div>}
          </div>
          <p className="text-xs text-gray-500">Motivo: {note.reason}</p>
        </div>
      )}
    </Dialog>
  );
}
