-- =============================================================================
-- SISTEMA DE INVENTARIO MULTI-SUCURSAL
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- TABLAS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sucursales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  direccion TEXT DEFAULT '',
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.perfiles_usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'trabajador')),
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.modelos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  imagen_url TEXT,
  precio NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio >= 0),
  categoria TEXT NOT NULL DEFAULT '',
  subcategoria TEXT NOT NULL DEFAULT '',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventario_sucursal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id UUID NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  modelo_id UUID NOT NULL REFERENCES public.modelos(id) ON DELETE CASCADE,
  cantidad INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sucursal_id, modelo_id)
);

CREATE TABLE IF NOT EXISTS public.transacciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id UUID NOT NULL REFERENCES public.inventario_sucursal(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'venta', 'transferencia')),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sucursal_destino_id UUID REFERENCES public.sucursales(id) ON DELETE RESTRICT,
  es_historico BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT transacciones_transferencia_destino CHECK (
    tipo <> 'transferencia' OR sucursal_destino_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_inventario_sucursal ON public.inventario_sucursal(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_inventario_modelo ON public.inventario_sucursal(modelo_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON public.transacciones(fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_transacciones_inventario ON public.transacciones(inventario_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_destino ON public.transacciones(sucursal_destino_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON public.perfiles_usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_perfiles_sucursal ON public.perfiles_usuarios(sucursal_id);

-- -----------------------------------------------------------------------------
-- TRIGGER: actualizar cantidad al insertar transacción
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ajustar_cantidad_inventario(
  p_inventario_id UUID,
  p_delta INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  stock_actual INTEGER;
BEGIN
  SELECT cantidad INTO stock_actual
  FROM public.inventario_sucursal
  WHERE id = p_inventario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventario no encontrado';
  END IF;

  IF stock_actual + p_delta < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %, ajuste: %', stock_actual, p_delta;
  END IF;

  UPDATE public.inventario_sucursal
  SET cantidad = cantidad + p_delta,
      updated_at = now()
  WHERE id = p_inventario_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventario_destino(
  p_inventario_origen UUID,
  p_sucursal_destino UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_modelo UUID;
  v_origen_sucursal UUID;
  v_dest UUID;
BEGIN
  SELECT modelo_id, sucursal_id INTO v_modelo, v_origen_sucursal
  FROM public.inventario_sucursal
  WHERE id = p_inventario_origen;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventario origen no encontrado';
  END IF;

  IF v_origen_sucursal = p_sucursal_destino THEN
    RAISE EXCEPTION 'La sucursal destino debe ser distinta a la origen';
  END IF;

  SELECT id INTO v_dest
  FROM public.inventario_sucursal
  WHERE modelo_id = v_modelo AND sucursal_id = p_sucursal_destino;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto no tiene inventario en la sucursal destino';
  END IF;

  RETURN v_dest;
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_efecto_transaccion(
  p_tipo TEXT,
  p_cantidad INTEGER,
  p_inventario_id UUID,
  p_sucursal_destino_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_dest UUID;
BEGIN
  IF p_tipo = 'entrada' THEN
    PERFORM public.ajustar_cantidad_inventario(p_inventario_id, p_cantidad);
  ELSIF p_tipo IN ('salida', 'venta') THEN
    PERFORM public.ajustar_cantidad_inventario(p_inventario_id, -p_cantidad);
  ELSIF p_tipo = 'transferencia' THEN
    IF p_sucursal_destino_id IS NULL THEN
      RAISE EXCEPTION 'La transferencia requiere sucursal destino';
    END IF;
    v_dest := public.inventario_destino(p_inventario_id, p_sucursal_destino_id);
    PERFORM public.ajustar_cantidad_inventario(p_inventario_id, -p_cantidad);
    PERFORM public.ajustar_cantidad_inventario(v_dest, p_cantidad);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revertir_efecto_transaccion(
  p_tipo TEXT,
  p_cantidad INTEGER,
  p_inventario_id UUID,
  p_sucursal_destino_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_dest UUID;
BEGIN
  IF p_tipo = 'entrada' THEN
    PERFORM public.ajustar_cantidad_inventario(p_inventario_id, -p_cantidad);
  ELSIF p_tipo IN ('salida', 'venta') THEN
    PERFORM public.ajustar_cantidad_inventario(p_inventario_id, p_cantidad);
  ELSIF p_tipo = 'transferencia' THEN
    IF p_sucursal_destino_id IS NULL THEN
      RAISE EXCEPTION 'La transferencia requiere sucursal destino';
    END IF;
    v_dest := public.inventario_destino(p_inventario_id, p_sucursal_destino_id);
    PERFORM public.ajustar_cantidad_inventario(v_dest, -p_cantidad);
    PERFORM public.ajustar_cantidad_inventario(p_inventario_id, p_cantidad);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_inventario_por_transaccion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT OLD.es_historico THEN
    PERFORM public.revertir_efecto_transaccion(
      OLD.tipo, OLD.cantidad, OLD.inventario_id, OLD.sucursal_destino_id
    );
  END IF;

  IF NOT NEW.es_historico THEN
    PERFORM public.aplicar_efecto_transaccion(
      NEW.tipo, NEW.cantidad, NEW.inventario_id, NEW.sucursal_destino_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_inventario ON public.transacciones;
CREATE TRIGGER trg_actualizar_inventario
  AFTER INSERT OR UPDATE OF tipo, cantidad, inventario_id, sucursal_destino_id, es_historico
  ON public.transacciones
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_inventario_por_transaccion();

-- -----------------------------------------------------------------------------
-- HELPERS RLS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_mi_rol()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.perfiles_usuarios WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_mi_sucursal()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sucursal_id FROM public.perfiles_usuarios WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles_usuarios
    WHERE id = auth.uid() AND rol = 'admin'
  );
$$;

-- Al crear un modelo nuevo, generar fila de inventario (qty 0) en cada sucursal
CREATE OR REPLACE FUNCTION public.crear_inventario_en_sucursales()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.inventario_sucursal (sucursal_id, modelo_id, cantidad)
  SELECT s.id, NEW.id, 0
  FROM public.sucursales s
  ON CONFLICT (sucursal_id, modelo_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_modelo_inventario ON public.modelos;
CREATE TRIGGER trg_modelo_inventario
  AFTER INSERT ON public.modelos
  FOR EACH ROW
  EXECUTE FUNCTION public.crear_inventario_en_sucursales();

-- Al crear una sucursal, generar inventario (qty 0) para todos los modelos
CREATE OR REPLACE FUNCTION public.crear_inventario_para_sucursal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.inventario_sucursal (sucursal_id, modelo_id, cantidad)
  SELECT NEW.id, m.id, 0
  FROM public.modelos m
  ON CONFLICT (sucursal_id, modelo_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sucursal_inventario ON public.sucursales;
CREATE TRIGGER trg_sucursal_inventario
  AFTER INSERT ON public.sucursales
  FOR EACH ROW
  EXECUTE FUNCTION public.crear_inventario_para_sucursal();

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------

ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_sucursal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacciones ENABLE ROW LEVEL SECURITY;

-- Sucursales
DROP POLICY IF EXISTS "Admin full sucursales" ON public.sucursales;
CREATE POLICY "Admin full sucursales" ON public.sucursales
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "Trabajador lee su sucursal" ON public.sucursales;
DROP POLICY IF EXISTS "Autenticados leen sucursales" ON public.sucursales;
CREATE POLICY "Autenticados leen sucursales" ON public.sucursales
  FOR SELECT TO authenticated USING (true);

-- Perfiles
DROP POLICY IF EXISTS "Usuarios leen su perfil" ON public.perfiles_usuarios;
CREATE POLICY "Usuarios leen su perfil" ON public.perfiles_usuarios
  FOR SELECT USING (id = auth.uid() OR public.es_admin());

DROP POLICY IF EXISTS "Admin gestiona perfiles" ON public.perfiles_usuarios;
CREATE POLICY "Admin gestiona perfiles" ON public.perfiles_usuarios
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "Usuario actualiza su perfil" ON public.perfiles_usuarios;
CREATE POLICY "Usuario actualiza su perfil" ON public.perfiles_usuarios
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Modelos (catálogo global)
DROP POLICY IF EXISTS "Todos autenticados leen modelos" ON public.modelos;
CREATE POLICY "Todos autenticados leen modelos" ON public.modelos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin gestiona modelos" ON public.modelos;
CREATE POLICY "Admin gestiona modelos" ON public.modelos
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

-- Inventario
DROP POLICY IF EXISTS "Admin full inventario" ON public.inventario_sucursal;
CREATE POLICY "Admin full inventario" ON public.inventario_sucursal
  FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "Trabajador lee su inventario" ON public.inventario_sucursal;
CREATE POLICY "Trabajador lee su inventario" ON public.inventario_sucursal
  FOR SELECT USING (sucursal_id = public.get_mi_sucursal());

DROP POLICY IF EXISTS "Trabajador inserta inventario de su sucursal" ON public.inventario_sucursal;
CREATE POLICY "Trabajador inserta inventario de su sucursal" ON public.inventario_sucursal
  FOR INSERT TO authenticated
  WITH CHECK (
    sucursal_id = public.get_mi_sucursal()
    AND cantidad >= 0
  );

-- Transacciones
DROP POLICY IF EXISTS "Admin lee transacciones" ON public.transacciones;
CREATE POLICY "Admin lee transacciones" ON public.transacciones
  FOR SELECT USING (public.es_admin());

DROP POLICY IF EXISTS "Trabajador lee transacciones de su sucursal" ON public.transacciones;
CREATE POLICY "Trabajador lee transacciones de su sucursal" ON public.transacciones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inventario_sucursal i
      WHERE i.id = inventario_id AND i.sucursal_id = public.get_mi_sucursal()
    )
    OR sucursal_destino_id = public.get_mi_sucursal()
  );

DROP POLICY IF EXISTS "Autenticados crean transacciones" ON public.transacciones;
CREATE POLICY "Autenticados crean transacciones" ON public.transacciones
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid()
    AND (
      public.es_admin()
      OR EXISTS (
        SELECT 1 FROM public.inventario_sucursal i
        WHERE i.id = inventario_id AND i.sucursal_id = public.get_mi_sucursal()
      )
    )
  );

DROP POLICY IF EXISTS "Admin actualiza transacciones" ON public.transacciones;
CREATE POLICY "Admin actualiza transacciones" ON public.transacciones
  FOR UPDATE USING (public.es_admin()) WITH CHECK (public.es_admin());

-- -----------------------------------------------------------------------------
-- STORAGE: bucket de imágenes de productos
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('productos', 'productos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Publico lee productos" ON storage.objects;
CREATE POLICY "Publico lee productos" ON storage.objects
  FOR SELECT USING (bucket_id = 'productos');

DROP POLICY IF EXISTS "Admin sube productos" ON storage.objects;
CREATE POLICY "Admin sube productos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'productos' AND public.es_admin());

DROP POLICY IF EXISTS "Admin actualiza productos" ON storage.objects;
CREATE POLICY "Admin actualiza productos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'productos' AND public.es_admin());

DROP POLICY IF EXISTS "Admin elimina productos" ON storage.objects;
CREATE POLICY "Admin elimina productos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'productos' AND public.es_admin());

-- -----------------------------------------------------------------------------
-- VISTA útil para reportes (opcional)
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_transacciones_detalle;
CREATE VIEW public.v_transacciones_detalle
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.tipo,
  t.cantidad,
  t.fecha_hora,
  t.usuario_id,
  t.sucursal_destino_id,
  t.es_historico,
  p.nombre AS usuario_nombre,
  i.sucursal_id,
  s.nombre AS sucursal_nombre,
  sd.nombre AS sucursal_destino_nombre,
  i.modelo_id,
  m.nombre AS modelo_nombre,
  m.imagen_url,
  m.precio,
  CASE WHEN t.tipo = 'venta' THEN t.cantidad * m.precio ELSE 0 END AS ganancia
FROM public.transacciones t
JOIN public.inventario_sucursal i ON i.id = t.inventario_id
JOIN public.sucursales s ON s.id = i.sucursal_id
JOIN public.modelos m ON m.id = i.modelo_id
LEFT JOIN public.sucursales sd ON sd.id = t.sucursal_destino_id
LEFT JOIN public.perfiles_usuarios p ON p.id = t.usuario_id;
