"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProductImage } from "@/components/ui/ProductImage";
import { Spinner } from "@/components/ui/Button";
import { ExportarInventario } from "@/components/ExportarInventario";
import type { InventarioMacroItem, InventarioSucursal, Sucursal } from "@/lib/types";
import { ChevronLeft, ChevronRight, LayoutGrid, Store } from "lucide-react";

const PAGE_SIZE = 24;

export default function AdminDashboardPage() {
  const [vista, setVista] = useState<"macro" | "micro">("macro");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState<string>("");
  const [macro, setMacro] = useState<InventarioMacroItem[]>([]);
  const [micro, setMicro] = useState<InventarioSucursal[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("sucursales")
      .select("*")
      .eq("activa", true)
      .order("nombre")
      .then(({ data }) => {
        setSucursales(data ?? []);
        if (data?.[0]) setSucursalId(data[0].id);
      });
  }, []);

  function sortItems<T extends { categoria?: string; subcategoria?: string; nombre: string }>(
    items: T[]
  ): T[] {
    return [...items].sort((a, b) => {
      const catA = (a.categoria ?? "").toLowerCase();
      const catB = (b.categoria ?? "").toLowerCase();
      if (catA !== catB) return catA.localeCompare(catB);
      const subA = (a.subcategoria ?? "").toLowerCase();
      const subB = (b.subcategoria ?? "").toLowerCase();
      if (subA !== subB) return subA.localeCompare(subB);
      return a.nombre.toLowerCase().localeCompare(b.nombre.toLowerCase());
    });
  }

  const loadMacro = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: modelos } = await supabase
      .from("modelos")
      .select("id, nombre, descripcion, imagen_url, categoria, subcategoria")
      .eq("activo", true);

    const { data: inv } = await supabase
      .from("inventario_sucursal")
      .select("modelo_id, cantidad");

    const map = new Map<string, number>();
    (inv ?? []).forEach((row) => {
      map.set(row.modelo_id, (map.get(row.modelo_id) ?? 0) + row.cantidad);
    });

    let items: InventarioMacroItem[] = (modelos ?? []).map((m) => ({
      modelo_id: m.id,
      nombre: m.nombre,
      descripcion: m.descripcion,
      imagen_url: m.imagen_url,
      categoria: m.categoria ?? "",
      subcategoria: m.subcategoria ?? "",
      total: map.get(m.id) ?? 0,
    }));

    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.nombre.toLowerCase().includes(qq) ||
          i.descripcion?.toLowerCase().includes(qq) ||
          (i.categoria ?? "").toLowerCase().includes(qq) ||
          (i.subcategoria ?? "").toLowerCase().includes(qq)
      );
    }

    items = sortItems(items);
    setTotal(items.length);
    setMacro(items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    setLoading(false);
  }, [page, q]);

  const loadMicro = useCallback(async () => {
    if (!sucursalId) return;
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("inventario_sucursal")
      .select("*, modelos!inner(*)")
      .eq("sucursal_id", sucursalId)
      .eq("modelos.activo", true);

    const { data } = await query;
    let rows = (data as InventarioSucursal[]) ?? [];

    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.modelos?.nombre.toLowerCase().includes(qq) ||
          r.modelos?.descripcion?.toLowerCase().includes(qq) ||
          (r.modelos?.categoria ?? "").toLowerCase().includes(qq) ||
          (r.modelos?.subcategoria ?? "").toLowerCase().includes(qq)
      );
    }

    rows = sortItems(
      rows.map((r) => ({
        ...r,
        categoria: r.modelos?.categoria ?? "",
        subcategoria: r.modelos?.subcategoria ?? "",
        nombre: r.modelos?.nombre ?? "",
      }))
    ).map((r) => {
      const { categoria: _c, subcategoria: _s, nombre: _n, ...rest } = r as any;
      return rest as InventarioSucursal;
    });

    const from = page * PAGE_SIZE;
    setMicro(rows.slice(from, from + PAGE_SIZE));
    setTotal(rows.length);
    setLoading(false);
  }, [sucursalId, page, q]);

  useEffect(() => {
    if (vista === "macro") loadMacro();
    else loadMicro();
  }, [vista, loadMacro, loadMicro]);

  useEffect(() => {
    setPage(0);
  }, [vista, sucursalId, q]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard de inventario</h1>
          <p className="mt-1 text-sm text-slate-500">
            Vista macro (todas) o micro (por sucursal)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setVista("macro")}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
              vista === "macro"
                ? "bg-teal-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Macro
          </button>
          <button
            type="button"
            onClick={() => setVista("micro")}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
              vista === "micro"
                ? "bg-teal-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            <Store className="h-4 w-4" />
            Micro
          </button>
          <ExportarInventario sucursales={sucursales} sucursalInicial={sucursalId} />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          placeholder="Buscar producto..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
        />
        {vista === "micro" && (
          <select
            value={sucursalId}
            onChange={(e) => setSucursalId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
          >
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-teal-600">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <GrupoConEncabezados
            items={
              vista === "macro"
                ? macro.map((i) => ({
                    key: i.modelo_id,
                    categoria: i.categoria ?? "",
                    subcategoria: i.subcategoria ?? "",
                    render: () => (
                      <article
                        key={i.modelo_id}
                        className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-100 transition hover:ring-teal-200"
                      >
                        <ProductImage
                          src={i.imagen_url}
                          alt={i.nombre}
                          className="aspect-[3/4] h-24 w-[4.5rem] shrink-0 rounded-xl"
                          sizes="72px"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold text-slate-900">{i.nombre}</h3>
                          {(i.categoria || i.subcategoria) && (
                            <p className="mt-0.5 truncate text-[11px] font-medium text-indigo-600">
                              {i.categoria}
                              {i.categoria && i.subcategoria ? " · " : ""}
                              {i.subcategoria}
                            </p>
                          )}
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                            {i.descripcion || "Sin descripción"}
                          </p>
                          <p className="mt-2 text-lg font-bold text-teal-700">{i.total}</p>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            Total todas las sucursales
                          </p>
                        </div>
                      </article>
                    ),
                  }))
                : micro.map((i) => ({
                    key: i.id,
                    categoria: i.modelos?.categoria ?? "",
                    subcategoria: i.modelos?.subcategoria ?? "",
                    render: () => (
                      <article
                        key={i.id}
                        className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-100 transition hover:ring-teal-200"
                      >
                        <ProductImage
                          src={i.modelos?.imagen_url}
                          alt={i.modelos?.nombre ?? ""}
                          className="aspect-[3/4] h-24 w-[4.5rem] shrink-0 rounded-xl"
                          sizes="72px"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold text-slate-900">
                            {i.modelos?.nombre}
                          </h3>
                          {(i.modelos?.categoria || i.modelos?.subcategoria) && (
                            <p className="mt-0.5 truncate text-[11px] font-medium text-indigo-600">
                              {i.modelos?.categoria}
                              {i.modelos?.categoria && i.modelos?.subcategoria ? " · " : ""}
                              {i.modelos?.subcategoria}
                            </p>
                          )}
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                            {i.modelos?.descripcion || "Sin descripción"}
                          </p>
                          <p className="mt-2 text-lg font-bold text-teal-700">{i.cantidad}</p>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            En sucursal
                          </p>
                        </div>
                      </article>
                    ),
                  }))
            }
          />

          {(macro.length === 0 && vista === "macro") ||
          (micro.length === 0 && vista === "micro") ? (
            <p className="py-12 text-center text-slate-500">
              No hay productos. Crea modelos en Catálogo.
            </p>
          ) : null}

          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-slate-500">
              Página {page + 1} de {totalPages} · {total} ítems
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
    </div>
  );
}

interface GrupoItem {
  key: string;
  categoria: string;
  subcategoria: string;
  render: () => React.ReactNode;
}

function GrupoConEncabezados({ items }: { items: GrupoItem[] }) {
  const blocks: React.ReactNode[] = [];
  let ultimaCat = "";
  let ultimaSub = "";

  for (const item of items) {
    const cat = item.categoria || "Sin categoría";
    const sub = item.subcategoria || "Sin subcategoría";

    if (cat !== ultimaCat) {
      blocks.push(
        <div
          key={`cat-${item.key}`}
          className="col-span-full mt-2 first:mt-0 rounded-xl bg-gradient-to-r from-teal-50 to-slate-50 px-4 py-2 ring-1 ring-teal-100"
        >
          <p className="text-sm font-bold uppercase tracking-wider text-teal-800">{cat}</p>
        </div>
      );
      ultimaCat = cat;
      ultimaSub = "";
    }

    if (sub !== ultimaSub) {
      blocks.push(
        <div
          key={`sub-${item.key}`}
          className="col-span-full flex items-center gap-3 px-1"
        >
          <span className="h-px flex-1 bg-indigo-100" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">
            {sub}
          </span>
          <span className="h-px flex-1 bg-indigo-100" />
        </div>
      );
      ultimaSub = sub;
    }

    blocks.push(item.render());
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {blocks}
    </div>
  );
}
