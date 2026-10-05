"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { emailDesdeNombre } from "@/lib/email-trabajador";
import { getCreatableRoles, ROLE_LABELS } from "@/lib/roles";
import type { PerfilUsuario, Rol, Sucursal } from "@/lib/types";
import { Pencil, Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";

export default function TrabajadoresPage() {
  const [items, setItems] = useState<PerfilUsuario[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PerfilUsuario | null>(null);
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [rol, setRol] = useState<Rol>("trabajador");
  const [loading, setLoading] = useState(false);
  const [miRol, setMiRol] = useState<Rol | null>(null);

  async function load() {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const rolesPromise = user
      ? supabase
          .from("perfiles_usuarios")
          .select("rol")
          .eq("id", user.id)
          .single()
      : Promise.resolve({ data: null });

    const [{ data: workers }, { data: sucs }, { data: miPerfil }] = await Promise.all([
      supabase
        .from("perfiles_usuarios")
        .select("*, sucursales(*)")
        .order("nombre"),
      supabase.from("sucursales").select("*").eq("activa", true).order("nombre"),
      rolesPromise,
    ]);

    const currentRole = (miPerfil?.rol as Rol) ?? null;
    setMiRol(currentRole);

    let filtered = (workers as PerfilUsuario[]) ?? [];
    if (currentRole === "admin") {
      filtered = filtered.filter((w) => w.rol !== "admin");
    } else if (currentRole === "supervisor") {
      filtered = filtered.filter((w) => w.rol === "trabajador");
    }

    setItems(filtered);
    setSucursales(sucs ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const rolesCreables = getCreatableRoles(miRol);

  function openCreate() {
    setEditing(null);
    setNombre("");
    setPassword("");
    setSucursalId(sucursales[0]?.id ?? "");
    setRol(rolesCreables[0] ?? "trabajador");
    setOpen(true);
  }

  function openEdit(w: PerfilUsuario) {
    setEditing(w);
    setNombre(w.nombre);
    setPassword("");
    setSucursalId(w.sucursal_id ?? "");
    setRol(w.rol);
    setOpen(true);
  }

  async function save() {
    if (!nombre.trim() || !sucursalId) {
      toast.error("Completa nombre y sucursal");
      return;
    }
    setLoading(true);
    try {
      if (editing) {
        const res = await fetch("/api/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: editing.id,
            nombre: nombre.trim(),
            sucursal_id: sucursalId,
            email: emailDesdeNombre(nombre),
            rol: miRol === "admin" ? rol : undefined,
            ...(password ? { password } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success("Usuario actualizado");
      } else {
        if (!password) {
          toast.error("La contraseña es obligatoria");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: emailDesdeNombre(nombre),
            password,
            nombre: nombre.trim(),
            sucursal_id: sucursalId,
            rol,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success("Usuario creado");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function eliminar(w: PerfilUsuario) {
    if (
      !confirm(
        `¿Eliminar a ${w.nombre}? Podrá dejar de entrar al sistema. Sus movimientos en reportes se conservan.`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: w.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Usuario eliminado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    } finally {
      setLoading(false);
    }
  }

  const esAdmin = miRol === "admin";
  const tituloBoton = esAdmin ? "Nuevo personal" : "Nuevo trabajador";
  const tituloPagina = esAdmin ? "Personal" : "Trabajadores";
  const subtituloPagina = esAdmin
    ? "Credenciales, roles y asignación de sucursal"
    : "Credenciales y asignación de sucursal";
  const tituloCrear = editing
    ? `Editar ${ROLE_LABELS[editing.rol] ?? "usuario"}`
    : `Nuevo ${ROLE_LABELS[rol] ?? "usuario"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{tituloPagina}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtituloPagina}</p>
        </div>
        <Button onClick={openCreate} disabled={!sucursales.length || rolesCreables.length === 0}>
          <Plus className="h-4 w-4" />
          {tituloBoton}
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              {esAdmin && (
                <th className="hidden px-4 py-3 font-medium md:table-cell">Rol</th>
              )}
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Sucursal</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <User className="h-4 w-4" />
                    </div>
                    <span className="font-medium text-slate-900">{w.nombre}</span>
                  </div>
                </td>
                {esAdmin && (
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span
                      className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${
                        w.rol === "supervisor"
                          ? "bg-indigo-50 text-indigo-700"
                          : "bg-slate-50 text-slate-600"
                      }`}
                    >
                      {ROLE_LABELS[w.rol] ?? w.rol}
                    </span>
                  </td>
                )}
                <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                  {w.sucursales?.nombre ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(w)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminar(w)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={esAdmin ? 4 : 3}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  Aún no hay personal registrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={tituloCrear}
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
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Inicia sesión con este nombre
            {nombre.trim() ? ` (${emailDesdeNombre(nombre)})` : ""}.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              {editing ? "Nueva contraseña (opcional)" : "Contraseña"}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
            />
          </label>
          {rolesCreables.length > 1 && !editing && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Rol</span>
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value as Rol)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
              >
                {rolesCreables.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Sucursal</span>
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
