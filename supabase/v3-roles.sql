-- =============================================================================
-- V3: SISTEMA DE 3 ROLES (Admin, Supervisor, Trabajador)
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ACTUALIZAR CHECK CONSTRAINT DE LA COLUMNA `rol` en perfiles_usuarios
-- -----------------------------------------------------------------------------
ALTER TABLE public.perfiles_usuarios
  DROP CONSTRAINT IF EXISTS perfiles_usuarios_rol_check;

ALTER TABLE public.perfiles_usuarios
  ADD CONSTRAINT perfiles_usuarios_rol_check
  CHECK (rol IN ('admin', 'supervisor', 'trabajador'));

-- -----------------------------------------------------------------------------
-- 2. HELPERS RLS PARA SUPERVISOR
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.es_supervisor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles_usuarios
    WHERE id = auth.uid() AND rol = 'supervisor'
  );
$$;

CREATE OR REPLACE FUNCTION public.es_admin_o_supervisor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles_usuarios
    WHERE id = auth.uid() AND rol IN ('admin', 'supervisor')
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. ACTUALIZACIÓN DE POLÍTICAS RLS
-- -----------------------------------------------------------------------------

-- Perfiles: Supervisor puede gestionar trabajadores
DROP POLICY IF EXISTS "Admin gestiona perfiles" ON public.perfiles_usuarios;
CREATE POLICY "Admin gestiona perfiles" ON public.perfiles_usuarios
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "Supervisor gestiona trabajadores" ON public.perfiles_usuarios;
CREATE POLICY "Supervisor gestiona trabajadores" ON public.perfiles_usuarios
  FOR ALL TO authenticated
  USING (
    public.es_supervisor() AND rol = 'trabajador'
  )
  WITH CHECK (
    public.es_supervisor() AND rol = 'trabajador'
  );

-- Modelos (Catálogo): Supervisor puede gestionar
DROP POLICY IF EXISTS "Admin gestiona modelos" ON public.modelos;
CREATE POLICY "Admin gestiona modelos" ON public.modelos
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "Supervisor gestiona modelos" ON public.modelos;
CREATE POLICY "Supervisor gestiona modelos" ON public.modelos
  FOR ALL TO authenticated
  USING (public.es_supervisor())
  WITH CHECK (public.es_supervisor());

-- Inventario: Admin o Supervisor pueden modificar cualquier sucursal
DROP POLICY IF EXISTS "Admin full inventario" ON public.inventario_sucursal;
CREATE POLICY "Admin full inventario" ON public.inventario_sucursal
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "Supervisor full inventario" ON public.inventario_sucursal;
CREATE POLICY "Supervisor full inventario" ON public.inventario_sucursal
  FOR ALL TO authenticated
  USING (public.es_supervisor())
  WITH CHECK (public.es_supervisor());

-- Transacciones: Supervisor lee todas y crea en cualquiera (no solo su sucursal)
DROP POLICY IF EXISTS "Admin lee transacciones" ON public.transacciones;
CREATE POLICY "Admin lee transacciones" ON public.transacciones
  FOR SELECT USING (public.es_admin());

DROP POLICY IF EXISTS "Supervisor lee transacciones" ON public.transacciones;
CREATE POLICY "Supervisor lee transacciones" ON public.transacciones
  FOR SELECT TO authenticated
  USING (public.es_supervisor());

DROP POLICY IF EXISTS "Trabajador lee transacciones de su sucursal" ON public.transacciones;
CREATE POLICY "Trabajador lee transacciones de su sucursal" ON public.transacciones
  FOR SELECT USING (
    get_mi_rol() = 'trabajador' AND (
      EXISTS (
        SELECT 1 FROM public.inventario_sucursal i
        WHERE i.id = inventario_id AND i.sucursal_id = public.get_mi_sucursal()
      )
      OR sucursal_destino_id = public.get_mi_sucursal()
    )
  );

DROP POLICY IF EXISTS "Autenticados crean transacciones" ON public.transacciones;
CREATE POLICY "Autenticados crean transacciones" ON public.transacciones
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid()
    AND (
      public.es_admin()
      OR public.es_supervisor()
      OR EXISTS (
        SELECT 1 FROM public.inventario_sucursal i
        WHERE i.id = inventario_id AND i.sucursal_id = public.get_mi_sucursal()
      )
    )
  );

-- Storage: Supervisor también puede subir/editar/eliminar imágenes de productos
DROP POLICY IF EXISTS "Admin sube productos" ON storage.objects;
CREATE POLICY "Admin sube productos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'productos' AND public.es_admin());

DROP POLICY IF EXISTS "Supervisor sube productos" ON storage.objects;
CREATE POLICY "Supervisor sube productos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'productos' AND public.es_supervisor());

DROP POLICY IF EXISTS "Admin actualiza productos" ON storage.objects;
CREATE POLICY "Admin actualiza productos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'productos' AND public.es_admin());

DROP POLICY IF EXISTS "Supervisor actualiza productos" ON storage.objects;
CREATE POLICY "Supervisor actualiza productos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'productos' AND public.es_supervisor());

DROP POLICY IF EXISTS "Admin elimina productos" ON storage.objects;
CREATE POLICY "Admin elimina productos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'productos' AND public.es_admin());

DROP POLICY IF EXISTS "Supervisor elimina productos" ON storage.objects;
CREATE POLICY "Supervisor elimina productos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'productos' AND public.es_supervisor());
