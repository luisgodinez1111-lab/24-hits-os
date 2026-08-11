"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, LockKeyhole, Plus, Wallet } from "lucide-react";
import {
  Badge, Button, Dialog, EmptyState, FormField, Input, Select, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { CashRegister, CashSession } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

interface Branch { id: string; name: string }

export default function CashSessionsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [managingRegisters, setManagingRegisters] = useState(false);
  const [closing, setClosing] = useState<CashSession | null>(null);
  const [moving, setMoving] = useState<CashSession | null>(null);

  const { data: sessions, isLoading } = useQuery({ queryKey: ["cash-sessions"], queryFn: () => api.get<CashSession[]>("/cash-sessions") });
  const { data: registers } = useQuery({ queryKey: ["cash-registers"], queryFn: () => api.get<CashRegister[]>("/cash-registers") });

  const registerName = (id: string) => registers?.find((r) => r.id === id)?.name ?? id.slice(0, 8);
  const refresh = () => qc.invalidateQueries({ queryKey: ["cash-sessions"] });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Turnos de caja</h1>
          <p className="text-sm text-gray-500">Apertura con fondo · arqueo al cierre · efectivo esperado derivado</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setManagingRegisters(true)}><Wallet className="h-4 w-4" /> Cajas</Button>
          <Button onClick={() => setOpening(true)}><Plus className="h-4 w-4" /> Abrir turno</Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState icon={<Wallet className="h-8 w-8 text-gray-400" />} title="Sin turnos de caja" />
      ) : (
        <Table>
          <THead><TR><TH>Caja</TH><TH className="text-right">Fondo</TH><TH className="text-right">Esperado</TH><TH className="text-right">Contado</TH><TH className="text-right">Diferencia</TH><TH>Estado</TH><TH className="text-right">Acciones</TH></TR></THead>
          <TBody>
            {sessions.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{registerName(s.registerId)}</TD>
                <TD className="text-right">${Number(s.openingFloat).toFixed(2)}</TD>
                <TD className="text-right">{s.expectedCash != null ? `$${Number(s.expectedCash).toFixed(2)}` : "—"}</TD>
                <TD className="text-right">{s.countedCash != null ? `$${Number(s.countedCash).toFixed(2)}` : "—"}</TD>
                <TD className="text-right">{s.difference != null ? <span className={Number(s.difference) < 0 ? "text-red-600" : "text-green-600"}>${Number(s.difference).toFixed(2)}</span> : "—"}</TD>
                <TD><Badge tone={s.status === "OPEN" ? "green" : "gray"}>{s.status}</Badge></TD>
                <TD className="text-right">
                  {s.status === "OPEN" && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setMoving(s)}><ArrowDownUp className="h-4 w-4" /> Movimiento</Button>
                      <Button size="sm" onClick={() => setClosing(s)}><LockKeyhole className="h-4 w-4" /> Cerrar</Button>
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <OpenSessionDialog open={opening} onClose={() => setOpening(false)} registers={registers ?? []}
        onDone={async () => { setOpening(false); await refresh(); toast.push("Turno abierto", "success"); }} />
      <RegistersDialog open={managingRegisters} onClose={() => setManagingRegisters(false)}
        onDone={async () => { await qc.invalidateQueries({ queryKey: ["cash-registers"] }); }} />
      <MovementDialog session={moving} onClose={() => setMoving(null)}
        onDone={async () => { setMoving(null); await refresh(); toast.push("Movimiento registrado", "success"); }} />
      <CloseSessionDialog session={closing} onClose={() => setClosing(null)}
        onDone={async () => { setClosing(null); await refresh(); toast.push("Turno cerrado", "success"); }} />
    </div>
  );
}

function OpenSessionDialog({ open, onClose, registers, onDone }: {
  open: boolean; onClose: () => void; registers: CashRegister[]; onDone: () => void;
}) {
  const toast = useToast();
  const [registerId, setRegisterId] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0");
  const mut = useMutation({
    mutationFn: () => api.post("/cash-sessions/open", { registerId, openingFloat: Number(openingFloat || 0) }),
    onSuccess: () => { setRegisterId(""); setOpeningFloat("0"); onDone(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Abrir turno de caja"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={mut.isPending} onClick={() => registerId ? mut.mutate() : toast.push("Selecciona una caja", "error")}>Abrir</Button></>}>
      <div className="space-y-3">
        <FormField label="Caja">
          <Select value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
            <option value="">…</option>{registers.filter((r) => r.status === "ACTIVE").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Fondo de apertura"><Input type="number" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} /></FormField>
      </div>
    </Dialog>
  );
}

function CloseSessionDialog({ session, onClose, onDone }: { session: CashSession | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [counted, setCounted] = useState("");
  const { data: live } = useQuery({
    queryKey: ["cash-session", session?.id], enabled: !!session,
    queryFn: () => api.get<CashSession>(`/cash-sessions/${session!.id}`),
  });
  const mut = useMutation({
    mutationFn: () => api.post(`/cash-sessions/${session!.id}/close`, { countedCash: Number(counted || 0) }),
    onSuccess: () => { setCounted(""); onDone(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  return (
    <Dialog open={!!session} onClose={onClose} title="Cerrar turno (arqueo)"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={mut.isPending} onClick={() => counted !== "" ? mut.mutate() : toast.push("Ingresa el efectivo contado", "error")}>Cerrar</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-gray-500">Efectivo esperado: <span className="font-semibold text-gray-900">${Number(live?.expectedCashLive ?? 0).toFixed(2)}</span></p>
        <FormField label="Efectivo contado"><Input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} /></FormField>
      </div>
    </Dialog>
  );
}

function MovementDialog({ session, onClose, onDone }: { session: CashSession | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ type: "WITHDRAWAL", amount: "", reason: "" });
  const mut = useMutation({
    mutationFn: () => api.post("/cash-sessions/movements", { cashSessionId: session!.id, type: form.type, amount: Number(form.amount || 0), reason: form.reason }),
    onSuccess: () => { setForm({ type: "WITHDRAWAL", amount: "", reason: "" }); onDone(); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  return (
    <Dialog open={!!session} onClose={onClose} title="Movimiento de efectivo"
      footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" loading={mut.isPending} onClick={() => Number(form.amount) > 0 && form.reason.trim() ? mut.mutate() : toast.push("Monto y motivo requeridos", "error")}>Registrar</Button></>}>
      <div className="space-y-3">
        <FormField label="Tipo">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="DEPOSIT">Ingreso</option>
            <option value="WITHDRAWAL">Retiro</option>
            <option value="EXPENSE">Gasto</option>
          </Select>
        </FormField>
        <FormField label="Monto"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></FormField>
        <FormField label="Motivo"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></FormField>
      </div>
    </Dialog>
  );
}

function RegistersDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data: registers } = useQuery({ queryKey: ["cash-registers"], queryFn: () => api.get<CashRegister[]>("/cash-registers"), enabled: open });
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches"), enabled: open });
  const [form, setForm] = useState({ branchId: "", name: "", code: "" });
  const create = useMutation({
    mutationFn: () => api.post("/cash-registers", { branchId: form.branchId, name: form.name, code: form.code }),
    onSuccess: async () => { setForm({ branchId: "", name: "", code: "" }); await onDone(); toast.push("Caja creada", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Cajas"
      footer={<Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>}>
      <div className="space-y-4">
        <div className="space-y-1">
          {(registers ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
              <span className="font-medium">{r.name}</span>
              <span className="font-mono text-xs text-gray-500">{r.code}</span>
            </div>
          ))}
          {registers && registers.length === 0 && <p className="text-sm text-gray-400">Aún no hay cajas.</p>}
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-gray-200 pt-3">
          <Select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
            <option value="">Sucursal…</option>{branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <Button size="sm" loading={create.isPending}
          onClick={() => form.branchId && form.name.trim() && form.code.trim() ? create.mutate() : toast.push("Completa los campos de la caja", "error")}>
          Agregar caja
        </Button>
      </div>
    </Dialog>
  );
}
