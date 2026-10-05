"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Spinner } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ProductImage } from "@/components/ui/ProductImage";
import { CantidadInput, parseCantidad } from "@/components/CantidadInput";
import type { InventarioSucursal, Sucursal, TipoTransaccion } from "@/lib/types";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 48;

interface GrupoItem {
  key: string;
  categoria: string;
  subcategoria: string;
  render: () => React.ReactNode;
}

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

function GrupoConEncabezados({
  items,
  children,
}: {
  items: GrupoItem[];
  children?: (card: React.ReactNode) => React.ReactNode;
}) {
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

    const node = item.render();
    blocks.push(children ? children(node) : node);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {blocks}
    </div>
  );
}

export default function TrabajadorInventarioPage() {
  const [items, setItems] = useState<InventarioSucursal[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sucursalId, setSucursalId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);

  const [opItem, setOpItem] = useState<InventarioSucursal | null>(null);
  const [opTipo, setOpTipo] = useState<TipoTransaccion>("entrada");
  const [cantidad, setCantidad] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function boot() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: perfil } = await supabase
        .from("perfiles_usuarios")
        .select("sucursal_id")
        .eq("id", user.id)
        .single();
      setSucursalId(perfil?.sucursal_id ?? null);

      const { data: sucs } = await supabase
        .from("sucursales")
        .select("*")
        .eq("activa", true)
        .order("nombre");
      setSucursales(sucs ?? []);
    }
    boot();
  }, []);

  const load = useCallback(async () => {
    if (!sucursalId) return;
    setLoading(true);
    const supabase = createClient();

    let catalogo = supabase
      .from("modelos")
      .select("*")
      .eq("activo", true);

    const { data: modelos } = await catalogo;
    let lista = modelos ?? [];

    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      lista = lista.filter(
        (m) =>
          m.nombre.toLowerCase().includes(qq) ||
          (m.descripcion ?? "").toLowerCase().includes(qq) ||
          (m.categoria ?? "").toLowerCase().includes(qq) ||
          (m.subcategoria ?? "").toLowerCase().includes(qq)
      );
    }

    const ids = lista.map((m) => m.id);

    const { data: invRows } =
      ids.length === 0
        ? { data: [] }
        : await supabase
            .from("inventario_sucursal")
            .select("*")
            .eq("sucursal_id", sucursalId)
            .in("modelo_id", ids);

    const porModelo = new Map(
      ((invRows as InventarioSucursal[]) ?? []).map((row) => [row.modelo_id, row])
    );

    let rows: InventarioSucursal[] = lista.map((m) => {
      const inv = porModelo.get(m.id);
      return {
        id: inv?.id ?? "",
        sucursal_id: sucursalId,
        modelo_id: m.id,
        cantidad: inv?.cantidad ?? 0,
        updated_at: inv?.updated_at,
        modelos: m,
      };
    });

    const rowsOrdenadas = sortItems(
      rows.map((r) => ({
        ...r,
        categoria: r.modelos?.categoria ?? "",
        subcategoria: r.modelos?.subcategoria ?? "",
        nombre: r.modelos?.nombre ?? "",
      }))
    );
    rows = (rowsOrdenadas as Array<any>).map((r) => {
      const { categoria: _c, subcategoria: _s, nombre: _n, ...rest } = r;
      return rest as InventarioSucursal;
    });

    const from = page * PAGE_SIZE;
    const sliced = rows.slice(from, from + PAGE_SIZE);
    setItems(sliced);
    setTotal(rows.length);
    setLoading(false);
  }, [sucursalId, page, q]);

  useEffect(() => {
    setPage(0);
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  const otrasSucursales = sucursales.filter((s) => s.id !== sucursalId);

  function openOp(item: InventarioSucursal, tipo: TipoTransaccion) {
    setOpItem(item);
    setOpTipo(tipo);
    setCantidad("");
    setDestinoId(otrasSucursales[0]?.id ?? "");
  }

  async function confirmar() {
    const qty = parseCantidad(cantidad);
    if (!opItem || !userId || !sucursalId || qty < 1) {
      toast.error("Indica una cantidad válida");
      return;
    }
    if (opTipo !== "entrada" && qty > opItem.cantidad) {
      toast.error(`Stock insuficiente (${opItem.cantidad} disponibles)`);
      return;
    }
    if (opTipo === "transferencia") {
      if (!destinoId) {
        toast.error("Elige la sucursal destino");
        return;
      }
      if (destinoId === sucursalId) {
        toast.error("El destino debe ser otra sucursal");
        return;
      }
    }
    setSaving(true);
    const supabase = createClient();
    try {
      const inventarioId = await asegurarInventario(supabase, sucursalId, opItem);

      const payload: Record<string, unknown> = {
        inventario_id: inventarioId,
        tipo: opTipo,
        cantidad: qty,
        usuario_id: userId,
      };
      if (opTipo === "transferencia") {
        payload.sucursal_destino_id = destinoId;
      }

      const { error } = await supabase.from("transacciones").insert(payload);
      if (error) throw error;

      setItems((prev) =>
        prev.map((it) => {
          if (it.modelo_id !== opItem.modelo_id) return it;
          const delta = opTipo === "entrada" ? qty : -qty;
          return { ...it, id: inventarioId, cantidad: it.cantidad + delta };
        })
      );

      const labels: Record<TipoTransaccion, string> = {
        entrada: "Entrada",
        salida: "Salida",
        venta: "Venta",
        transferencia: "Transferencia",
      };
      toast.success(`${labels[opTipo]} registrada · ${qty} uds.`);
      setOpItem(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar");
      await load();
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tituloModal =
    opTipo === "entrada"
      ? "Registrar entrada"
      : opTipo === "transferencia"
        ? "Transferir a otra sucursal"
        : opTipo === "venta"
          ? "Registrar venta"
          : "Registrar salida";

  if (sucursalId === null && !loading) {
    return (
      <p className="py-20 text-center text-slate-500">
        No tienes sucursal asignada. Contacta al administrador.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi inventario</h1>
        <p className="mt-1 text-sm text-slate-500">
          Operaciones a 1 clic · sin recargar la página
        </p>
      </div>

      <input
        type="search"
        placeholder="Buscar producto..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
      />

      {loading ? (
        <div className="flex justify-center py-20 text-teal-600">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {items.length === 0 ? (
            <p className="py-12 text-center text-slate-500">
              No hay productos en el catálogo
            </p>
          ) : (
            <GrupoConEncabezados
              items={items.map((item) => ({
                key: item.modelo_id,
                categoria: item.modelos?.categoria ?? "",
                subcategoria: item.modelos?.subcategoria ?? "",
                render: () => (
                  <article
                    key={item.modelo_id}
                    className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100"
                  >
                    <ProductImage
                      src={item.modelos?.imagen_url}
                      alt={item.modelos?.nombre ?? ""}
                      className="aspect-[3/4] w-full"
                      sizes="(max-width:640px) 100vw, 33vw"
                    />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-slate-900">
                            {item.modelos?.nombre}
                          </h3>
                          {(item.modelos?.categoria ||
                            item.modelos?.subcategoria) && (
                            <p className="mt-0.5 truncate text-[11px] font-medium text-indigo-600">
                              {item.modelos?.categoria}
                              {item.modelos?.categoria &&
                              item.modelos?.subcategoria
                                ? " · "
                                : ""}
                              {item.modelos?.subcategoria}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-lg bg-teal-50 px-2.5 py-1 text-sm font-bold text-teal-800">
                          {item.cantidad}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {item.modelos?.descripcion || "Sin descripción"}
                      </p>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <Button
                          size="sm"
                          variant="success"
                          className="!px-2"
                          onClick={() => openOp(item, "entrada")}
                        >
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                          Entrada
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="!px-2"
                          onClick={() => openOp(item, "transferencia")}
                          disabled={
                            item.cantidad === 0 || otrasSucursales.length === 0
                          }
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                          Transferir
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          className="!px-2"
                          onClick={() => openOp(item, "venta")}
                          disabled={item.cantidad === 0}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          Venta
                        </Button>
                      </div>
                    </div>
                  </article>
                ),
              }))}
            />
          )}

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

      <Modal open={!!opItem} onClose={() => setOpItem(null)} title={tituloModal} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{opItem?.modelos?.nombre}</span>
            {" · "}Stock actual: {opItem?.cantidad}
          </p>
          {opTipo === "transferencia" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Sucursal destino
              </span>
              <select
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
              >
                {otrasSucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Cantidad</span>
            <CantidadInput
              value={cantidad}
              onChange={setCantidad}
              max={opTipo === "entrada" ? undefined : opItem?.cantidad}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpItem(null)}>
              Cancelar
            </Button>
            <Button
              loading={saving}
              onClick={confirmar}
              variant={
                opTipo === "transferencia"
                  ? "secondary"
                  : opTipo === "entrada"
                    ? "success"
                    : "primary"
              }
            >
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

async function asegurarInventario(
  supabase: ReturnType<typeof createClient>,
  sucursalId: string,
  item: InventarioSucursal
): Promise<string> {
  if (item.id) return item.id;

  const { data: existente, error: selError } = await supabase
    .from("inventario_sucursal")
    .select("id")
    .eq("sucursal_id", sucursalId)
    .eq("modelo_id", item.modelo_id)
    .maybeSingle();
  if (selError) throw selError;
  if (existente?.id) return existente.id;

  const { data: creado, error: insError } = await supabase
    .from("inventario_sucursal")
    .insert({
      sucursal_id: sucursalId,
      modelo_id: item.modelo_id,
      cantidad: 0,
    })
    .select("id")
    .single();

  if (!insError && creado?.id) return creado.id;

  const { data: reintento } = await supabase
    .from("inventario_sucursal")
    .select("id")
    .eq("sucursal_id", sucursalId)
    .eq("modelo_id", item.modelo_id)
    .maybeSingle();
  if (reintento?.id) return reintento.id;

  throw insError ?? new Error("No se pudo crear el inventario del producto");
}
