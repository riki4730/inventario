"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/Button";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CantidadInput, parseCantidad } from "@/components/CantidadInput";
import { formatMoney } from "@/lib/format";
import type { FiltroMovimiento, Rol, Sucursal, TipoTransaccion } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 20;

type Periodo = "diario" | "semanal" | "mensual" | "todo";

interface Row {
  id: string;
  tipo: TipoTransaccion;
  cantidad: number;
  fecha_hora: string;
  usuario_id: string;
  sucursal_destino_id: string | null;
  inventario_sucursal: {
    sucursal_id: string;
    modelos: { nombre: string; precio: number | null } | null;
    sucursales: { nombre: string } | null;
  } | null;
}

function rangeFor(periodo: Periodo): string | null {
  const now = new Date();
  if (periodo === "todo") return null;
  const d = new Date(now);
  if (periodo === "diario") d.setHours(0, 0, 0, 0);
  if (periodo === "semanal") d.setDate(d.getDate() - 7);
  if (periodo === "mensual") d.setMonth(d.getMonth() - 1);
  return d.toISOString();
}

const tipoLabel: Record<TipoTransaccion, string> = {
  entrada: "Ingreso",
  salida: "Salida",
  venta: "Venta",
  transferencia: "Transferencia",
};

const tipoColor: Record<TipoTransaccion, string> = {
  entrada: "bg-emerald-50 text-emerald-700",
  salida: "bg-amber-50 text-amber-700",
  venta: "bg-sky-50 text-sky-700",
  transferencia: "bg-violet-50 text-violet-700",
};

function gananciaDe(r: Row): number {
  if (r.tipo !== "venta") return 0;
  const precio = Number(r.inventario_sucursal?.modelos?.precio ?? 0);
  return r.cantidad * precio;
}

export default function ReportesPage() {
  const [periodo, setPeriodo] = useState<Periodo>("diario");
  const [sucursalId, setSucursalId] = useState<string>("");
  const [filtroTipo, setFiltroTipo] = useState<FiltroMovimiento>("todos");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [rol, setRol] = useState<Rol | null>(null);
  const [gananciaPeriodo, setGananciaPeriodo] = useState(0);

  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editCantidad, setEditCantidad] = useState("");
  const [editDestino, setEditDestino] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("sucursales")
      .select("*")
      .then(({ data }) => {
        const list = (data ?? []) as Sucursal[];
        const activas = list.filter((s) => s.activa !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
        const inactivas = list.filter((s) => s.activa === false).sort((a, b) => a.nombre.localeCompare(b.nombre));
        setSucursales([...activas, ...inactivas]);
      });

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from("perfiles_usuarios")
        .select("rol")
        .eq("id", user.id)
        .single();
      setRol((perfil?.rol as Rol) ?? null);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const since = rangeFor(periodo);

    let inventarioIds: string[] | null = null;
    if (sucursalId) {
      const { data: inv } = await supabase
        .from("inventario_sucursal")
        .select("id")
        .eq("sucursal_id", sucursalId);
      inventarioIds = (inv ?? []).map((i) => i.id);
    }

    let query = supabase
      .from("transacciones")
      .select(
        `
        id, tipo, cantidad, fecha_hora, usuario_id, sucursal_destino_id,
        inventario_sucursal (
          sucursal_id,
          modelos ( nombre, precio ),
          sucursales ( nombre )
        )
      `,
        { count: "exact" }
      )
      .order("fecha_hora", { ascending: false })
      .range(from, to);

    if (since) query = query.gte("fecha_hora", since);
    if (filtroTipo === "entrada") query = query.eq("tipo", "entrada");
    if (filtroTipo === "venta") query = query.eq("tipo", "venta");
    if (filtroTipo === "transferencia") query = query.eq("tipo", "transferencia");
    if (inventarioIds) {
      if (inventarioIds.length === 0) {
        setRows([]);
        setTotal(0);
        setGananciaPeriodo(0);
        setLoading(false);
        return;
      }
      query = query.in("inventario_id", inventarioIds);
    }

    const { data, count, error } = await query;
    if (error) {
      console.error(error);
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const filtered = (data as unknown as Row[]) ?? [];
    setRows(filtered);
    setTotal(count ?? filtered.length);

    const ids = [...new Set(filtered.map((r) => r.usuario_id))];
    if (ids.length) {
      const { data: perfiles } = await supabase
        .from("perfiles_usuarios")
        .select("id, nombre")
        .in("id", ids);
      const map: Record<string, string> = {};
      (perfiles ?? []).forEach((p) => {
        map[p.id] = p.nombre;
      });
      setNombres(map);
    }

    let gQuery = supabase
      .from("transacciones")
      .select(
        `
        cantidad, tipo,
        inventario_sucursal ( sucursal_id, modelos ( precio ) )
      `
      )
      .eq("tipo", "venta");
    if (since) gQuery = gQuery.gte("fecha_hora", since);
    const { data: ventas } = await gQuery;
    const ganancia = ((ventas as unknown as Row[]) ?? [])
      .filter((r) => !sucursalId || r.inventario_sucursal?.sucursal_id === sucursalId)
      .reduce((acc, r) => acc + gananciaDe(r), 0);
    setGananciaPeriodo(ganancia);

    setLoading(false);
  }, [page, periodo, sucursalId, filtroTipo]);

  useEffect(() => {
    setPage(0);
  }, [periodo, sucursalId, filtroTipo]);

  useEffect(() => {
    load();
  }, [load]);

  async function guardarEdicion() {
    if (!editRow || rol !== "admin") return;
    const qty = parseCantidad(editCantidad);
    if (qty < 1) {
      toast.error("Cantidad inválida");
      return;
    }
    if (editRow.tipo === "transferencia" && !editDestino) {
      toast.error("Elige sucursal destino");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    try {
      const patch: Record<string, unknown> = { cantidad: qty };
      if (editRow.tipo === "transferencia") patch.sucursal_destino_id = editDestino;
      const { error } = await supabase.from("transacciones").update(patch).eq("id", editRow.id);
      if (error) throw error;
      toast.success("Movimiento actualizado");
      setEditRow(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo editar");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const esAdmin = rol === "admin";
  const colCount = esAdmin ? 8 : 7;

  const filtros: { id: FiltroMovimiento; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "entrada", label: "Ingresos" },
    { id: "venta", label: "Salidas (Ventas)" },
    { id: "transferencia", label: "Transferencias" },
  ];

  function sucursalDestinoNombre(id: string | null): string {
    if (!id) return "—";
    return sucursales.find((s) => s.id === id)?.nombre ?? "—";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Historial, filtros por tipo y ganancias de ventas
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {(["diario", "semanal", "mensual", "todo"] as Periodo[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriodo(p)}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium capitalize transition ${
              periodo === p
                ? "bg-teal-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {p}
          </button>
        ))}
        <select
          value={sucursalId}
          onChange={(e) => setSucursalId(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-teal-500 sm:ml-auto"
        >
          <option value="">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
              {s.activa === false ? " (Cerrada)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {filtros.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltroTipo(f.id)}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
              filtroTipo === f.id
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Ganancia (solo ventas, no transferencias)
        </p>
        <p className="mt-1 text-2xl font-bold text-teal-700">{formatMoney(gananciaPeriodo)}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-teal-600">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-100">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Modelo</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Cant.</th>
                  <th className="px-4 py-3 font-medium">Ganancia</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Sucursal</th>
                  {esAdmin && <th className="px-4 py-3 font-medium text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {r.inventario_sucursal?.modelos?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${tipoColor[r.tipo]}`}
                      >
                        {tipoLabel[r.tipo]}
                        {r.tipo === "transferencia" && r.sucursal_destino_id
                          ? ` → ${sucursalDestinoNombre(r.sucursal_destino_id)}`
                          : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.cantidad}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.tipo === "venta" ? formatMoney(gananciaDe(r)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(r.fecha_hora).toLocaleString("es")}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {nombres[r.usuario_id] ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.inventario_sucursal?.sucursales?.nombre ?? "—"}
                    </td>
                    {esAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditRow(r);
                            setEditCantidad(String(r.cantidad));
                            setEditDestino(r.sucursal_destino_id ?? "");
                          }}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50"
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-12 text-center text-slate-500">
                      Sin transacciones en este periodo
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Página {page + 1} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-xl bg-white p-2 ring-1 ring-slate-200 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-xl bg-white p-2 ring-1 ring-slate-200 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title="Editar movimiento"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {editRow?.inventario_sucursal?.modelos?.nombre} · {editRow ? tipoLabel[editRow.tipo] : ""}
          </p>
          {editRow?.tipo === "transferencia" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Sucursal destino
              </span>
              <select
                value={editDestino}
                onChange={(e) => setEditDestino(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
              >
                {sucursales
                  .filter((s) => s.id !== editRow.inventario_sucursal?.sucursal_id && s.activa !== false)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Cantidad</span>
            <CantidadInput value={editCantidad} onChange={setEditCantidad} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditRow(null)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={guardarEdicion}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
