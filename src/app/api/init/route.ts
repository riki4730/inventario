import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_ADMIN_EMAIL = "admin@sistema.com";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_BRANCH = "Sucursal Principal";

/**
 * Asegura Admin + sucursal inicial.
 * Idempotente: se puede llamar en cada carga de /login.
 */
export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { count: sucCount, error: sucCountError } = await supabase
      .from("sucursales")
      .select("*", { count: "exact", head: true });

    if (sucCountError) {
      return NextResponse.json({ ok: false, error: sucCountError.message }, { status: 500 });
    }

    let sucursalNombre = DEFAULT_BRANCH;
    if ((sucCount ?? 0) === 0) {
      const { data: sucursal, error: sucError } = await supabase
        .from("sucursales")
        .insert({ nombre: DEFAULT_BRANCH, direccion: "Dirección pendiente" })
        .select("nombre")
        .single();
      if (sucError) {
        return NextResponse.json({ ok: false, error: sucError.message }, { status: 500 });
      }
      sucursalNombre = sucursal.nombre;
    }

    let adminUser = await findUserByEmail(supabase, DEFAULT_ADMIN_EMAIL);
    let createdAuth = false;

    if (!adminUser) {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { nombre: "Administrador" },
      });

      if (authError || !authData.user) {
        adminUser = await findUserByEmail(supabase, DEFAULT_ADMIN_EMAIL);
        if (!adminUser) {
          return NextResponse.json(
            { ok: false, error: authError?.message ?? "No se pudo crear el admin" },
            { status: 500 }
          );
        }
      } else {
        adminUser = authData.user;
        createdAuth = true;
      }
    }

    const { data: perfil, error: perfilSelectError } = await supabase
      .from("perfiles_usuarios")
      .select("id")
      .eq("id", adminUser.id)
      .maybeSingle();

    if (perfilSelectError) {
      return NextResponse.json({ ok: false, error: perfilSelectError.message }, { status: 500 });
    }

    let createdPerfil = false;
    if (!perfil) {
      const { error: perfilError } = await supabase.from("perfiles_usuarios").insert({
        id: adminUser.id,
        nombre: "Administrador",
        rol: "admin",
        sucursal_id: null,
      });
      if (perfilError) {
        return NextResponse.json({ ok: false, error: perfilError.message }, { status: 500 });
      }
      createdPerfil = true;
    }

    const initialized = createdAuth || createdPerfil;

    return NextResponse.json({
      ok: true,
      initialized,
      message: initialized ? "Sistema inicializado" : "Ya configurado",
      credentials: initialized
        ? {
            email: DEFAULT_ADMIN_EMAIL,
            password: DEFAULT_ADMIN_PASSWORD,
            sucursal: sucursalNombre,
          }
        : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de inicialización";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function findUserByEmail(
  supabase: {
    auth: {
      admin: {
        listUsers: (args: {
          page: number;
          perPage: number;
        }) => Promise<{
          data: { users: { id: string; email?: string }[] };
          error: { message: string } | null;
        }>;
      };
    };
  },
  email: string
) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}
