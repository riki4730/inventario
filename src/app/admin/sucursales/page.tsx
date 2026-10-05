"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { Sucursal } from "@/lib/types";
import { Pencil, Plus, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SucursalesPage() {
  const [items, setItems] = useState<Sucursal[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Sucursal | null>(null);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("sucursales")
      .select("*")
      .eq("activa", true)
      .order("nombre");
    setItems(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setNombre("");
    setDireccion("");
    setOpen(true);
  }

  function openEdit(s: Sucursal) {
    setEditing(s);
    setNombre(s.nombre);
    setDireccion(s.direccion ?? "");
    setOpen(true);
  }

  async function save() {
    if (!nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    try {
      if (editing) {
        const { error } = await supabase
          .from("sucursales")
          .update({ nombre: nombre.trim(), direccion: direccion.trim() })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Sucursal actualizada");
      } else {
        const { error } = await supabase
          .from("sucursales")
          .insert({ nombre: nombre.trim(), direccion: direccion.trim() });
        if (error) throw error;
        toast.success("Sucursal creada");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  async function eliminar(s: Sucursal) {
    if (
      !confirm(
        `¿Desactivar la sucursal "${s.nombre}"? Dejará de aparecer en selectores. El historial conserva el nombre.`
      )
    ) {
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("sucursales").update({ activa: false }).eq("id", s.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sucursal desactivada");
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sucursales</h1>
          <p className="mt-1 text-sm text-slate-500">Gestión centralizada de ubicaciones</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nueva sucursal
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-slate-900">{s.nombre}</h3>
              <p className="mt-0.5 text-sm text-slate-500">
                {s.direccion || "Sin dirección"}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => openEdit(s)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => eliminar(s)}
                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar sucursal" : "Nueva sucursal"}
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Dirección</span>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={loading} onClick={save}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
