-- =============================================================================
-- Borrado lógico + FK trabajadores (historial intacto)
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

ALTER TABLE public.modelos
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.modelos
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT '';

ALTER TABLE public.modelos
  ADD COLUMN IF NOT EXISTS subcategoria TEXT NOT NULL DEFAULT '';

ALTER TABLE public.sucursales
  ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_modelos_activo ON public.modelos(activo);
CREATE INDEX IF NOT EXISTS idx_sucursales_activa ON public.sucursales(activa);

-- Historial: al borrar el usuario de Auth, la transacción permanece
ALTER TABLE public.transacciones
  ALTER COLUMN usuario_id DROP NOT NULL;

ALTER TABLE public.transacciones
  DROP CONSTRAINT IF EXISTS transacciones_usuario_id_fkey;

ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;
