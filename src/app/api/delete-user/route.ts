import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Rol } from "@/lib/types";
import { canManageTargetRole } from "@/lib/roles";

/** Elimina perfil + usuario Auth. El historial queda con usuario_id nulo. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: miPerfil } = await supabase
      .from("perfiles_usuarios")
      .select("rol")
      .eq("id", user.id)
      .single();

    const miRol = (miPerfil?.rol as Rol | undefined) ?? null;

    const body = await request.json();
    const userId = body.userId as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "Falta userId" }, { status: 400 });
    }
    if (userId === user.id) {
      return NextResponse.json({ error: "No puedes eliminar tu propio usuario" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: target } = await admin
      .from("perfiles_usuarios")
      .select("rol")
      .eq("id", userId)
      .maybeSingle();

    const rolDestino = (target?.rol as Rol | undefined) ?? null;

    if (!canManageTargetRole(miRol, rolDestino)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { error: perfilError } = await admin.from("perfiles_usuarios").delete().eq("id", userId);
    if (perfilError) {
      return NextResponse.json({ error: perfilError.message }, { status: 400 });
    }

    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
