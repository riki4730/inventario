"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  descargarExcelInventario,
  descargarPdfInventario,
  etiquetaGrupo,
  type FilaExportacion,
} from "@/lib/export-inventario";
import type { Sucursal } from "@/lib/types";
import { Download } from "lucide-react";
import { toast } from "sonner";

interface ExportarInventarioProps {
  sucursales: Sucursal[];
  sucursalInicial?: string;
}

export function ExportarInventario({ sucursales, sucursalInicial }: ExportarInventarioProps) {
  const [open, setOpen] = useState(false);
  const [sucursalId, setSucursalId] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [loading, setLoading] = useState<"pdf" | "xlsx" | null>(null);

  useEffect(() => {
    if (open) setSucursalId(sucursalInicial ?? "");
  }, [open, sucursalInicial]);

  async function cargarFilas(): Promise<{ filas: FilaExportacion[]; sucursalLabel: string }> {
    const supabase = createClient();
    let query = supabase
      .from("inventario_sucursal")
      .select(
        `
        cantidad, updated_at, sucursal_id,
        modelos ( nombre, precio, categoria, subcategoria, activo ),
        sucursales ( nombre, activa )
      `
      );

    if (sucursalId) query = query.eq("sucursal_id", sucursalId);
    if (desde) query = query.gte("updated_at", new Date(`${desde}T00:00:00`).toISOString());
    if (hasta) query = query.lte("updated_at", new Date(`${hasta}T23:59:59`).toISOString());

    const { data, error } = await query;
    if (error) throw error;

    type Raw = {
      cantidad: number;
      sucursal_id: string;
      modelos: {
        nombre: string;
        precio: number | null;
        categoria: string | null;
        subcategoria: string | null;
        activo: boolean | null;
      } | null;
      sucursales: { nombre: string; activa: boolean | null } | null;
    };

    const filas: FilaExportacion[] = ((data as unknown as Raw[]) ?? [])
      .filter((r) => r.modelos && r.modelos.activo !== false)
      .map((r) => ({
        categoria: etiquetaGrupo(r.modelos?.categoria, "Sin categoría"),
        subcategoria: etiquetaGrupo(r.modelos?.subcategoria, "Sin subcategoría"),
        producto: r.modelos?.nombre ?? "—",
        stock: r.cantidad,
        sucursal: r.sucursales?.nombre ?? "—",
        precio: Number(r.modelos?.precio) || 0,
      }));

    const sucursalLabel =
      sucursales.find((s) => s.id === sucursalId)?.nombre ?? "Todas las sucursales";

    return { filas, sucursalLabel };
  }

  async function exportar(formato: "pdf" | "xlsx") {
    setLoading(formato);
    try {
      const { filas, sucursalLabel } = await cargarFilas();
      if (!filas.length) {
        toast.error("No hay datos para exportar con esos filtros");
        return;
      }
      const meta = { sucursal: sucursalLabel, desde, hasta };
      if (formato === "pdf") await descargarPdfInventario(filas, meta);
      else await descargarExcelInventario(filas, meta);
      toast.success("Descarga lista");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" />
        Exportar
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Exportar inventario">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Sucursal</span>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
            >
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Desde</span>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Hasta</span>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            El archivo agrupa por categoría y subcategoría. Las fechas filtran por última
            actualización de stock.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" loading={loading === "pdf"} onClick={() => exportar("pdf")}>
              Descargar PDF
            </Button>
            <Button loading={loading === "xlsx"} onClick={() => exportar("xlsx")}>
              Descargar Excel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
