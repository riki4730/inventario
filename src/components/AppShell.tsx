"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  Users,
  Package,
  FileBarChart,
  UserCog,
  LogOut,
  Menu,
  X,
  Boxes,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { Rol } from "@/lib/types";

const adminLinks = [
  { href: "/admin", label: "Inventario", icon: LayoutDashboard },
  { href: "/admin/sucursales", label: "Sucursales", icon: Store },
  { href: "/admin/trabajadores", label: "Trabajadores", icon: Users },
  { href: "/admin/catalogo", label: "Catálogo", icon: Package },
  { href: "/admin/reportes", label: "Reportes", icon: FileBarChart },
  { href: "/admin/perfil", label: "Mi perfil", icon: UserCog },
];

const trabajadorLinks = [
  { href: "/trabajador", label: "Mi inventario", icon: Boxes },
];

const supervisorLinks = [
  { href: "/trabajador", label: "Mi inventario", icon: Boxes },
  { href: "/admin/catalogo", label: "Catálogo", icon: Package },
  { href: "/admin/trabajadores", label: "Trabajadores", icon: Users },
  { href: "/admin/perfil", label: "Mi perfil", icon: UserCog },
];

interface AppShellProps {
  children: React.ReactNode;
  role: Rol;
  userName: string;
  sucursalNombre?: string | null;
}

export function AppShell({ children, role, userName, sucursalNombre }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const links =
    role === "admin"
      ? adminLinks
      : role === "supervisor"
        ? supervisorLinks
        : trabajadorLinks;

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/admin" || href === "/trabajador") return pathname === href;
    return pathname.startsWith(href);
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            isActive(href)
              ? "bg-teal-50 text-teal-800"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <Icon className="h-4.5 w-4.5 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-slate-900">Inventario</span>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Salir"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <span className="font-semibold text-slate-900">Menú</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-100 px-5 py-5">
            <p className="text-xs font-medium uppercase tracking-wider text-teal-600">
              Sistema
            </p>
            <h1 className="text-lg font-bold text-slate-900">Inventario</h1>
            <p className="mt-2 truncate text-sm text-slate-500">{userName}</p>
            {sucursalNombre && (
              <p className="truncate text-xs text-slate-400">{sucursalNombre}</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">{nav}</div>
          <div className="border-t border-slate-100 p-3">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
