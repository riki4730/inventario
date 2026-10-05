"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { parseInventarioSheet, type FilaImportacion } from "@/lib/excel-inventario";
import type { Sucursal } from "@/lib/types";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

interface ImportarExcelProps {
  onDone?: () => void;
}

export function ImportarExcel({ onDone }: ImportarExcelProps) {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaImportacion[]>([]);
  const [generarHistorial, setGenerarHistorial] = useState(true);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    createClient()
      .from("sucursales")
      .select("*")
      .eq("activa", true)
      .order("nombre")
      .then(({ data }) => {
        const list = data ?? [];
        setSucursales(list);
        if (list[0]) setSucursalId(list[0].id);
      });
  }, []);

  async function onFile(file: File | null) {
    setLog([]);
    setFilas([]);
    setFileName(file?.name ?? null);
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("El archivo no tiene hojas");
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        defval: null,
        raw: true,
      });
      const parsed = parseInventarioSheet(rows, sheet["!merges"]);
      if (!parsed.length) throw new Error("No se encontraron filas de productos");
      setFilas(parsed);
      toast.success(`${parsed.length} productos leídos`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el Excel");
    }
  }

  async function importar() {
    if (!sucursalId) {
      toast.error("Elige una sucursal");
      return;
    }
    if (!filas.length) {
      toast.error("Selecciona un archivo .xlsx");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const messages: string[] = [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sesión inválida");
      setLoading(false);
      return;
    }

    try {
      const { data: existentes, error: exErr } = await supabase
        .from("modelos")
        .select("id, nombre, precio, categoria, subcategoria");
      if (exErr) throw exErr;

      const byName = new Map<
        string,
        { id: string; precio: number; categoria?: string; subcategoria?: string }
      >();
      (existentes ?? []).forEach((m) => {
        byName.set(m.nombre.trim().toLowerCase(), {
          id: m.id,
          precio: Number(m.precio),
          categoria: m.categoria ?? "",
          subcategoria: m.subcategoria ?? "",
        });
      });

      let creados = 0;
      let actualizados = 0;
      let errores = 0;

      for (const fila of filas) {
        const key = fila.nombre.trim().toLowerCase();
        try {
          let modeloId = byName.get(key)?.id;
          if (!modeloId) {
            const { data: created, error } = await supabase
              .from("modelos")
              .insert({
                nombre: fila.nombre.trim(),
                descripcion: "",
                precio: fila.precio,
                categoria: fila.categoria ?? "",
                subcategoria: fila.subcategoria ?? "",
              })
              .select("id")
              .single();
            if (error || !created?.id) throw error ?? new Error("No se pudo crear el producto");
            modeloId = created.id;
            byName.set(key, {
              id: created.id,
              precio: fila.precio,
              categoria: fila.categoria,
              subcategoria: fila.subcategoria,
            });
            creados += 1;
          } else {
            const anterior = byName.get(key)!;
            const patch: Record<string, unknown> = { precio: fila.precio };
            if (fila.categoria && fila.categoria !== anterior.categoria) {
              patch.categoria = fila.categoria;
            }
            if (fila.subcategoria && fila.subcategoria !== anterior.subcategoria) {
              patch.subcategoria = fila.subcategoria;
            }
            const { error } = await supabase
              .from("modelos")
              .update(patch)
              .eq("id", modeloId);
            if (error) throw error;
            actualizados += 1;
          }

          const { data: inv, error: invErr } = await supabase
            .from("inventario_sucursal")
            .select("id, cantidad")
            .eq("sucursal_id", sucursalId)
            .eq("modelo_id", modeloId)
            .maybeSingle();
          if (invErr) throw invErr;
          if (!inv) throw new Error("Sin fila de inventario (¿falta sucursal?)");

          const { error: stockErr } = await supabase
            .from("inventario_sucursal")
            .update({ cantidad: Math.max(0, Math.round(fila.total)), updated_at: new Date().toISOString() })
            .eq("id", inv.id);
          if (stockErr) throw stockErr;

          if (generarHistorial) {
            const hist: {
              inventario_id: string;
              tipo: "entrada" | "venta" | "transferencia";
              cantidad: number;
              usuario_id: string;
              es_historico: boolean;
              sucursal_destino_id?: string;
            }[] = [];

            const qtyIn = Math.round(fila.entrada);
            const qtyOut = Math.round(fila.venta);
            const qtyTr = Math.round(fila.transferencia);

            if (qtyIn > 0) {
              hist.push({
                inventario_id: inv.id,
                tipo: "entrada",
                cantidad: qtyIn,
                usuario_id: user.id,
                es_historico: true,
              });
            }
            if (qtyOut > 0) {
              hist.push({
                inventario_id: inv.id,
                tipo: "venta",
                cantidad: qtyOut,
                usuario_id: user.id,
                es_historico: true,
              });
            }
            if (qtyTr > 0) {
              const dest = sucursales.find((s) => s.id !== sucursalId);
              if (dest) {
                hist.push({
                  inventario_id: inv.id,
                  tipo: "transferencia",
                  cantidad: qtyTr,
                  usuario_id: user.id,
                  es_historico: true,
                  sucursal_destino_id: dest.id,
                });
              }
            }

            if (hist.length) {
              const { error: hErr } = await supabase.from("transacciones").insert(hist);
              if (hErr) throw hErr;
            }
          }
        } catch (e) {
          errores += 1;
          messages.push(
            `${fila.nombre}: ${e instanceof Error ? e.message : "error"}`
          );
        }
      }

      const summary = `Creados ${creados} · actualizados ${actualizados} · errores ${errores}`;
      messages.unshift(summary);
      setLog(messages);
      if (errores) toast.error(summary);
      else toast.success(summary);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fallo la importación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-100 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <FileSpreadsheet className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Importar inventario (.xlsx)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Columnas mínimas: Producto, Stock. Opcionales: Precio, Categoria,
            Subcategoria, Entrada, Salida / Transferencia, Venta y Total.
          </p>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          Sucursal destino del stock
        </span>
        <select
          value={sucursalId}
          onChange={(e) => setSucursalId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
        >
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 hover:border-teal-400 hover:bg-teal-50/50">
        <Upload className="h-6 w-6 text-slate-400" />
        <span>{fileName ?? "Elegir archivo Excel"}</span>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {filas.length > 0 && (
        <p className="text-sm text-slate-600">
          {filas.length} filas listas. Primera: <strong>{filas[0].nombre}</strong> ·
          total {filas[0].total}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={generarHistorial}
          onChange={(e) => setGenerarHistorial(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-teal-600"
        />
        Generar historial (entradas, ventas y transferencias) sin volver a mover stock
      </label>

      <Button loading={loading} onClick={importar} disabled={!filas.length}>
        Importar a esta sucursal
      </Button>

      {log.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
