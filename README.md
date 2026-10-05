# Inventario Multi-sucursal

Aplicación web completa (Next.js App Router + Supabase + PWA) para gestionar inventario en varias sucursales, con roles Admin / Trabajador, inicialización automática y UX no invasiva.

---

## Manual de instalación

### 1. Requisitos

- Node.js 20+ (recomendado 22+)
- Cuenta en [Supabase](https://supabase.com)
- npm

### 2. Crear proyecto Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project**
2. Espera a que el proyecto esté listo
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon` `public` key
   - `service_role` key (secret)

### 3. Ejecutar el SQL

1. En Supabase: **SQL Editor → New query**
2. Pega el contenido de `supabase/schema.sql`
3. Pulsa **Run**

Esto crea tablas, RLS, triggers de stock automático, bucket `productos` y la vista de reportes.

### 4. Configurar variables de entorno

```bash
cp .env.local.example .env.local
```

Edita `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

> `SUPABASE_SERVICE_ROLE_KEY` solo se usa en el servidor (API de init y creación de usuarios). Nunca la expongas al cliente.

### 5. Auth: Email / Password

En Supabase → **Authentication → Providers**:

- Activa **Email**
- Desactiva proveedores sociales (Google, etc.)
- En **Authentication → Settings**, puedes desactivar “Confirm email” para desarrollo (el init ya crea el admin confirmado)

### 6. Instalar y correr

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### 7. Inicialización automática

Al cargar `/login`, la app llama a `POST /api/init`:

- Si **no hay usuarios**, crea:
  - Admin: `admin@sistema.com` / `admin123`
  - Sucursal: **Sucursal Principal**
- Si ya hay usuarios, no hace nada (idempotente)

Inicia sesión con esas credenciales y cámbialas en **Admin → Mi perfil**.

### 8. Producción

```bash
npm run build
npm start
```

Despliega en Vercel / similar y configura las mismas variables de entorno.

---

## Instalar como PWA (app nativa)

La app usa `@ducanh2912/next-pwa` (service worker + manifest). El SW se genera en **build de producción**. Los scripts usan `--webpack` (requerido en Next.js 16 para el plugin PWA).

### En PC (Chrome / Edge)

1. Abre la URL de producción (HTTPS)
2. En la barra de direcciones → icono **Instalar** / “Instalar aplicación”
3. O menú ⋮ → **Instalar Inventario**

### En Android (Chrome)

1. Abre la URL
2. Menú ⋮ → **Instalar aplicación** / **Añadir a la pantalla de inicio**

### En iPhone (Safari)

1. Abre la URL en Safari
2. Botón **Compartir** → **Añadir a pantalla de inicio**

Modo `standalone`: se abre sin barra del navegador, con soporte offline básico (`/offline`).

---

## Credenciales por defecto (solo primera vez)

| Campo        | Valor              |
|-------------|--------------------|
| Email       | `admin@sistema.com` |
| Contraseña  | `admin123`          |
| Sucursal    | Sucursal Principal  |

Cámbialas inmediatamente desde el panel.

---

## Estructura del proyecto

```
src/
  app/
    login/page.tsx
    admin/          → solo rol admin
      page.tsx              Dashboard macro/micro
      sucursales/page.tsx
      trabajadores/page.tsx
      catalogo/page.tsx
      reportes/page.tsx
      perfil/page.tsx
    trabajador/     → solo rol trabajador
      page.tsx              Inventario + 1 clic
    api/
      init/route.ts         Auto-setup admin + sucursal
      users/route.ts        Crear/editar usuarios Auth
  components/
  lib/supabase/
  middleware.ts             Protección /admin y /trabajador
supabase/
  schema.sql
public/
  manifest.json
  icons/
```

---

## Funcionalidades clave

- **Triggers PostgreSQL**: cada transacción actualiza el stock automáticamente
- **Paginación** en inventario y reportes
- **Imágenes** con `next/image` + Storage (`productos`)
- **Toasts** con Sonner (sin `alert()` del navegador)
- **Roles**: middleware redirige según `perfiles_usuarios.rol`
