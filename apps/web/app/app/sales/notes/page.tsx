"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Printer, Receipt } from "lucide-react";
import {
  Badge, Button, Dialog, EmptyState, FormField, Input, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { SaleNote } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

const money = (v?: string | null) => (v == null ? "—" : `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default function SaleNotesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<SaleNote | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["sale-notes"], queryFn: () => api.get<SaleNote[]>("/sale-notes") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["sale-notes"] });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Notas de venta</h1>
        <p className="text-sm text-gray-500">Comprobantes emitidos · folio consecutivo por serie</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Receipt className="h-8 w-8 text-gray-400" />} title="Sin notas de venta" description="Emite una nota desde un pedido entregado." />
      ) : (
        <Table>
          <THead><TR><TH>Folio</TH><TH>Cliente</TH><TH className="text-right">Total</TH><TH className="text-right">Pagado</TH><TH>Estado</TH><TH className="text-right">Acciones</TH></TR></THead>
          <TBody>
            {data.map((n) => (
              <TR key={n.id}>
                <TD className="font-mono text-xs">{n.number}</TD>
                <TD className="font-medium">{n.customerName ?? "Mostrador"}</TD>
                <TD className="text-right">{money(n.total)}</TD>
                <TD className="text-right text-gray-500">{money(n.paidTotal)}</TD>
                <TD><Badge tone={n.status === "ISSUED" ? "green" : "red"}>{n.status}</Badge></TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setViewing(n.id)}><Printer className="h-4 w-4" /> Ver</Button>
                    {n.status === "ISSUED" && <Button size="sm" variant="ghost" onClick={() => setCancelling(n)}><Ban className="h-4 w-4" /> Cancelar</Button>}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <NoteDetailDialog id={viewing} onClose={() => setViewing(null)} />
      <CancelNoteDialog note={cancelling} onClose={() => setCancelling(null)}
        onDone={async () => { setCancelling(null); await refresh(); toast.push("Nota cancelada", "success"); }} />
    </div>
  );
}

function NoteDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: note } = useQuery({
    queryKey: ["sale-note", id], enabled: !!id,
    queryFn: () => api.get<SaleNote>(`/sale-notes/${id}`),
  });

  return (
    <Dialog open={!!id} onClose={onClose} title={note ? `Nota ${note.number}` : "Nota de venta"}
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Button></>}>
      {!note ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="space-y-3 text-sm" id="sale-note-print">
          <div className="flex justify-between">
            <div>
              <p className="font-mono font-semibold">{note.number}</p>
              <p className="text-gray-500">{new Date(note.issuedAt).toLocaleString("es-MX")}</p>
            </div>
            <Badge tone={note.status === "ISSUED" ? "green" : "red"}>{note.status}</Badge>
          </div>
          <div className="border-t border-gray-200 pt-2">
            <p className="font-medium">{note.customerName ?? "Mostrador"}</p>
            {note.customerTaxId && <p className="text-gray-500">RFC: {note.customerTaxId}</p>}
          </div>
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
            <Row label="Subtotal" value={money(note.subtotal)} />
            {Number(note.discountTotal) > 0 && <Row label="Descuento" value={`- ${money(note.discountTotal)}`} />}
            {Number(note.taxTotal) > 0 && <Row label="Impuestos" value={money(note.taxTotal)} />}
            <Row label="Total" value={money(note.total)} strong />
            <Row label="Pagado" value={money(note.paidTotal)} />
            <Row label="Saldo" value={money((Number(note.total) - Number(note.paidTotal)).toFixed(4))} />
          </div>
          {note.status === "CANCELLED" && note.cancelledReason && (
            <p className="text-xs text-red-600">Cancelada: {note.cancelledReason}</p>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-bold text-gray-900" : "text-gray-600"}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function CancelNoteDialog({ note, onClose, onDone }: { note: SaleNote | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => api.post(`/sale-notes/${note!.id}/cancel`, { reason }),
    onSuccess: () => { setReason(""); onDone(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  return (
    <Dialog open={!!note} onClose={onClose} title={`Cancelar nota ${note?.number ?? ""}`}
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
        <Button size="sm" loading={mut.isPending} onClick={() => reason.trim() ? mut.mutate() : toast.push("Indica el motivo", "error")}>Cancelar nota</Button></>}>
      <FormField label="Motivo de cancelación"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
    </Dialog>
  );
}
