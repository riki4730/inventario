"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

export default function PerfilPage() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email ?? "");
      const { data: perfil } = await supabase
        .from("perfiles_usuarios")
        .select("nombre")
        .eq("id", user.id)
        .single();
      setNombre(perfil?.nombre ?? "");
    }
    load();
  }, []);

  async function save() {
    if (password && password !== password2) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    if (password && password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          nombre: nombre.trim(),
          email,
          ...(password ? { password } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Perfil actualizado");
      setPassword("");
      setPassword2("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi perfil</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cambia tu correo y contraseña de forma segura
        </p>
      </div>

      <div className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-slate-100 sm:p-6">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Nueva contraseña
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Dejar vacío para no cambiar"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Confirmar contraseña
          </span>
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
          />
        </label>
        <Button loading={loading} onClick={save} className="w-full sm:w-auto">
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
