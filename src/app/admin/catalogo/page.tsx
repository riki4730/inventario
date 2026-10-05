"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ProductImage } from "@/components/ui/ProductImage";
import { ImportarExcel } from "@/components/ImportarExcel";
import { formatMoney } from "@/lib/format";
import type { Modelo } from "@/lib/types";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

export default function CatalogoPage() {
  const [items, setItems] = useState<Modelo[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Modelo | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("modelos")
      .select("*")
      .eq("activo", true)
      .order("nombre");
    setItems(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setNombre("");
    setDescripcion("");
    setPrecio("");
    setCategoria("");
    setSubcategoria("");
    setFile(null);
    setPreview(null);
    setOpen(true);
  }

  function openEdit(m: Modelo) {
    setEditing(m);
    setNombre(m.nombre);
    setDescripcion(m.descripcion ?? "");
    setPrecio(m.precio != null && Number(m.precio) !== 0 ? String(m.precio) : "");
    setCategoria(m.categoria ?? "");
    setSubcategoria(m.subcategoria ?? "");
    setFile(null);
    setPreview(m.imagen_url);
    setOpen(true);
  }

  function onFile(f: File | null) {
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  }

  async function uploadImage(modeloId: string): Promise<string | null> {
    if (!file) return editing?.imagen_url ?? null;
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${modeloId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("productos").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("productos").getPublicUrl(path);
    return data.publicUrl;
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
        const imagen_url = await uploadImage(editing.id);
        const { error } = await supabase
          .from("modelos")
          .update({
            nombre: nombre.trim(),
            descripcion: descripcion.trim(),
            precio: Number(precio) || 0,
            categoria: categoria.trim(),
            subcategoria: subcategoria.trim(),
            imagen_url,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Producto actualizado");
      } else {
        const { data, error } = await supabase
          .from("modelos")
          .insert({
            nombre: nombre.trim(),
            descripcion: descripcion.trim(),
            precio: Number(precio) || 0,
            categoria: categoria.trim(),
            subcategoria: subcategoria.trim(),
            activo: true,
          })
          .select()
          .single();
        if (error) throw error;
        if (file) {
          const imagen_url = await uploadImage(data.id);
          await supabase.from("modelos").update({ imagen_url }).eq("id", data.id);
        }
        toast.success("Producto creado · inventario generado en todas las sucursales");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  async function eliminar(m: Modelo) {
    if (!confirm(`¿Ocultar "${m.nombre}" del catálogo? El historial de movimientos se conserva.`)) {
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("modelos").update({ activo: false }).eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Producto ocultado");
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catálogo global</h1>
          <p className="mt-1 text-sm text-slate-500">
            Productos con imagen en Supabase Storage
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo producto
        </Button>
      </div>

      <ImportarExcel onDone={load} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((m) => (
          <article
            key={m.id}
            className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100"
          >
            <ProductImage
              src={m.imagen_url}
              alt={m.nombre}
              className="aspect-[3/4] w-full"
              sizes="(max-width:640px) 100vw, 25vw"
            />
            <div className="flex items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-900">{m.nombre}</h3>
                <p className="mt-0.5 text-sm font-medium text-teal-700">
                  {formatMoney(Number(m.precio) || 0)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                  {m.descripcion || "Sin descripción"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(m)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => eliminar(m)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar producto" : "Nuevo producto"}
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
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Precio</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Categoría</span>
            <input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Subcategoría</span>
            <input
              value={subcategoria}
              onChange={(e) => setSubcategoria(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Descripción
            </span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Imagen</span>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 hover:border-teal-400 hover:bg-teal-50/50">
              {preview ? (
                <div className="relative aspect-[3/4] w-24 overflow-hidden rounded-xl">
                  <Image src={preview} alt="Preview" fill className="object-cover object-center" unoptimized />
                </div>
              ) : (
                <Upload className="h-6 w-6 text-slate-400" />
              )}
              <span>{file ? file.name : "Subir imagen"}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
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
