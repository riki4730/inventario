import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import type { Rol } from "@/lib/types";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles_usuarios")
    .select("nombre, rol, sucursal_id, sucursales(nombre)")
    .eq("id", user.id)
    .single();

  const rol = (perfil?.rol as Rol | undefined) ?? null;

  if (rol !== "admin" && rol !== "supervisor") {
    redirect("/trabajador");
  }

  return (
    <AppShell
      role={rol}
      userName={perfil?.nombre ?? ""}
      sucursalNombre={(perfil as any)?.sucursales?.nombre ?? null}
    >
      {children}
    </AppShell>
  );
}
