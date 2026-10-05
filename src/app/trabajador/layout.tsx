import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function TrabajadorLayout({
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

  if (perfil?.rol !== "trabajador") redirect("/admin");

  const sucursal = perfil.sucursales as unknown as { nombre: string } | null;

  return (
    <AppShell
      role="trabajador"
      userName={perfil.nombre}
      sucursalNombre={sucursal?.nombre}
    >
      {children}
    </AppShell>
  );
}
