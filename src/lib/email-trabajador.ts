export const LOGIN_EMAIL_DOMAIN = "sistema.com";

/** Convierte el nombre de login en el email que espera Supabase. */
export function emailDesdeNombre(nombre: string): string {
  const trimmed = nombre.trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  const local = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  return `${local}@${LOGIN_EMAIL_DOMAIN}`;
}
