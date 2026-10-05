import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Rol } from "@/lib/types";
import {
  canAccessAdminArea,
  canAccessWorkerArea,
  getDefaultRouteForRole,
} from "@/lib/roles";

function sanitizeSessionCookieOptions(
  options?: Parameters<typeof NextResponse.prototype.cookies.set>[2]
) {
  if (!options) return options;
  const nextOptions = { ...options };
  delete nextOptions.maxAge;
  delete nextOptions.expires;
  return nextOptions;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              sanitizeSessionCookieOptions(options)
            )
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && (path.startsWith("/admin") || path.startsWith("/trabajador"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (path.startsWith("/admin") || path.startsWith("/trabajador"))) {
    const { data: perfil } = await supabase
      .from("perfiles_usuarios")
      .select("rol")
      .eq("id", user.id)
      .single();

    const rol = (perfil?.rol as Rol | undefined) ?? null;

    if (path.startsWith("/admin") && !canAccessAdminArea(rol, path)) {
      const url = request.nextUrl.clone();
      url.pathname = rol ? getDefaultRouteForRole(rol) : "/login";
      return NextResponse.redirect(url);
    }

    if (path.startsWith("/trabajador") && !canAccessWorkerArea(rol)) {
      const url = request.nextUrl.clone();
      url.pathname = rol ? getDefaultRouteForRole(rol) : "/login";
      return NextResponse.redirect(url);
    }
  }

  if (user && (path === "/login" || path === "/")) {
    const { data: perfil } = await supabase
      .from("perfiles_usuarios")
      .select("rol")
      .eq("id", user.id)
      .single();

    const url = request.nextUrl.clone();
    url.pathname = getDefaultRouteForRole((perfil?.rol as Rol | undefined) ?? null);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
