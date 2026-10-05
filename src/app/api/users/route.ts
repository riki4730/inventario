import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreatableRoles } from "@/lib/roles";
import type { Rol } from "@/lib/types";

/** Crear usuario (Auth + perfil) — Admin crea supervisor/trabajador, Supervisor crea solo trabajadores */
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
    const rolesCreables = getCreatableRoles(miRol);
    if (rolesCreables.length === 0) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, nombre, sucursal_id, rol } = body as {
      email: string;
      password: string;
      nombre: string;
      sucursal_id: string;
      rol?: Rol;
    };

    if (!email || !password || !nombre || !sucursal_id) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const rolDestino: Rol = rol && rolesCreables.includes(rol) ? rol : "trabajador";
    if (!rolesCreables.includes(rolDestino)) {
      return NextResponse.json({ error: "Rol no permitido" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message ?? "Error al crear usuario" },
        { status: 400 }
      );
    }

    const { error: perfilError } = await admin.from("perfiles_usuarios").insert({
      id: authData.user.id,
      nombre,
      rol: rolDestino,
      sucursal_id,
    });

    if (perfilError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: perfilError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: authData.user.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Actualizar email/password de un usuario */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { userId, email, password, nombre, sucursal_id, rol } = body as {
      userId?: string;
      email?: string;
      password?: string;
      nombre?: string;
      sucursal_id?: string | null;
      rol?: Rol;
    };

    const targetId = userId ?? user.id;
    const isSelf = targetId === user.id;

    const { data: miPerfil } = await supabase
      .from("perfiles_usuarios")
      .select("rol")
      .eq("id", user.id)
      .single();

    const miRol = (miPerfil?.rol as Rol | undefined) ?? null;
    let rolDestino: Rol | null = null;

    if (!isSelf) {
      const { data: perfilDestino } = await supabase
        .from("perfiles_usuarios")
        .select("rol")
        .eq("id", targetId)
        .single();

      const rolActualDestino = (perfilDestino?.rol as Rol | undefined) ?? null;

      if (miRol === "admin") {
        if (rol && rol !== "admin") rolDestino = rol;
      } else if (miRol === "supervisor") {
        if (rolActualDestino !== "trabajador") {
          return NextResponse.json({ error: "No autorizado" }, { status: 403 });
        }
        if (rol && rol !== "trabajador") {
          return NextResponse.json({ error: "Rol no permitido" }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    const admin = createAdminClient();

    if (email || password) {
      const updates: { email?: string; password?: string; email_confirm?: boolean } = {};
      if (email) {
        updates.email = email;
        updates.email_confirm = true;
      }
      if (password) updates.password = password;

      const { error } = await admin.auth.admin.updateUserById(targetId, updates);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    const perfilUpdates: Record<string, unknown> = {};
    if (nombre !== undefined) perfilUpdates.nombre = nombre;
    if (sucursal_id !== undefined && (miRol === "admin" || miRol === "supervisor")) {
      perfilUpdates.sucursal_id = sucursal_id;
    }
    if (rolDestino) perfilUpdates.rol = rolDestino;

    if (Object.keys(perfilUpdates).length > 0) {
      const { error } = await admin
        .from("perfiles_usuarios")
        .update(perfilUpdates)
        .eq("id", targetId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
