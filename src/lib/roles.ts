import type { Rol } from "@/lib/types";

export const ROLE_LABELS: Record<Rol, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  trabajador: "Trabajador",
};

export function getDefaultRouteForRole(rol: Rol | null | undefined) {
  return rol === "admin" ? "/admin" : "/trabajador";
}

export function canAccessWorkerArea(rol: Rol | null | undefined) {
  return rol === "trabajador" || rol === "supervisor";
}

export function canAccessAdminArea(
  rol: Rol | null | undefined,
  pathname: string
) {
  if (rol === "admin") return true;
  if (rol !== "supervisor") return false;

  return (
    pathname === "/admin/catalogo" ||
    pathname.startsWith("/admin/catalogo/") ||
    pathname === "/admin/trabajadores" ||
    pathname.startsWith("/admin/trabajadores/") ||
    pathname === "/admin/perfil" ||
    pathname.startsWith("/admin/perfil/")
  );
}

export function getCreatableRoles(rol: Rol | null | undefined): Rol[] {
  if (rol === "admin") return ["supervisor", "trabajador"];
  if (rol === "supervisor") return ["trabajador"];
  return [];
}

export function canManageTargetRole(
  managerRole: Rol | null | undefined,
  targetRole: Rol | null | undefined
) {
  if (!targetRole) return false;
  if (managerRole === "admin") return targetRole !== "admin";
  if (managerRole === "supervisor") return targetRole === "trabajador";
  return false;
}
