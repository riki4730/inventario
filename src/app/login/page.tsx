"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { emailDesdeNombre } from "@/lib/email-trabajador";
import { Button } from "@/components/ui/Button";
import { Boxes, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initMsg, setInitMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/init", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.initialized) {
          setInitMsg("Sistema listo. Usa admin / admin123");
          setNombre("admin");
          setPassword("admin123");
          toast.success("Sistema inicializado automáticamente");
        }
      })
      .catch(() => {
        /* silencioso: puede fallar si aún no hay .env */
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const email = emailDesdeNombre(nombre);
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(
          error.message === "Invalid login credentials"
            ? "Nombre o contraseña incorrectos"
            : error.message
        );
        return;
      }

      const { data: perfil } = await supabase
        .from("perfiles_usuarios")
        .select("rol")
        .eq("id", data.user.id)
        .single();

      toast.success("Bienvenido");
      router.push(perfil?.rol === "admin" ? "/admin" : "/trabajador");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#ccfbf1_0%,_#f8fafc_45%,_#e2e8f0_100%)]" />
      <div className="pointer-events-none absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-teal-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-1/4 h-64 w-64 rounded-full bg-cyan-200/30 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/25">
            <Boxes className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Inventario</h1>
          <p className="mt-2 text-slate-500">Multi-sucursal · Acceso seguro</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-sm sm:p-8"
        >
          {initMsg && (
            <div className="mb-4 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">
              {initMsg}
            </div>
          )}

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Nombre del trabajador
            </span>
            <input
              type="text"
              required
              autoComplete="username"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none ring-teal-500/30 transition focus:border-teal-500 focus:ring-4"
              placeholder="admin"
            />
          </label>

          <label className="mb-6 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Contraseña</span>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-11 text-slate-900 outline-none ring-teal-500/30 transition focus:border-teal-500 focus:ring-4"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showPass ? "Ocultar" : "Mostrar"}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Iniciar sesión
          </Button>
        </form>
      </div>
    </div>
  );
}
