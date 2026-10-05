import { createBrowserClient } from "@supabase/ssr";

type BrowserCookieOptions = {
  domain?: string;
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

function getAllBrowserCookies() {
  if (typeof document === "undefined" || !document.cookie) return [];

  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      const name = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
      const value = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : "";

      return {
        name: decodeURIComponent(name),
        value: decodeURIComponent(value),
      };
    });
}

function setBrowserCookie(
  name: string,
  value: string,
  options?: BrowserCookieOptions & {
    maxAge?: number;
    expires?: Date;
  }
) {
  if (typeof document === "undefined") return;

  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `Path=${options?.path ?? "/"}`,
  ];

  if (options?.domain) parts.push(`Domain=${options.domain}`);
  if (options?.secure) parts.push("Secure");

  const sameSite = options?.sameSite;
  if (sameSite === true) parts.push("SameSite=Strict");
  else if (sameSite) parts.push(`SameSite=${sameSite}`);

  document.cookie = parts.join("; ");
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: getAllBrowserCookies,
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            setBrowserCookie(name, value, options);
          });
        },
      },
    }
  );
}
