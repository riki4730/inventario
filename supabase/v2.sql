-- =============================================================================
-- v2 — Precio, transferencias, edición admin e importación histórica
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- Precio de producto (ganancia = cantidad * precio en ventas)
ALTER TABLE public.modelos
  ADD COLUMN IF NOT EXISTS precio NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio >= 0);

-- Destino de transferencia + filas históricas (no mueven stock; las usa la importación)
ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS sucursal_destino_id UUID REFERENCES public.sucursales(id) ON DELETE RESTRICT;

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS es_historico BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_tipo_check;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_tipo_check
  CHECK (tipo IN ('entrada', 'salida', 'venta', 'transferencia'));

ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_transferencia_destino;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_transferencia_destino
  CHECK (
    tipo <> 'transferencia'
    OR sucursal_destino_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_transacciones_destino
  ON public.transacciones(sucursal_destino_id);

-- -----------------------------------------------------------------------------
-- Stock: aplicar / revertir (INSERT y UPDATE para corrección admin)
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

-- Trabajadores necesitan ver otras sucursales para elegir destino
DROP POLICY IF EXISTS "Trabajador lee su sucursal" ON public.sucursales;
DROP POLICY IF EXISTS "Autenticados leen sucursales" ON public.sucursales;
CREATE POLICY "Autenticados leen sucursales" ON public.sucursales
  FOR SELECT TO authenticated USING (true);

-- Trabajadores ven transferencias que entran a su sucursal
DROP POLICY IF EXISTS "Trabajador lee transacciones de su sucursal" ON public.transacciones;
CREATE POLICY "Trabajador lee transacciones de su sucursal" ON public.transacciones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inventario_sucursal i
      WHERE i.id = inventario_id AND i.sucursal_id = public.get_mi_sucursal()
    )
    OR sucursal_destino_id = public.get_mi_sucursal()
  );

-- Admin corrige historial
DROP POLICY IF EXISTS "Admin actualiza transacciones" ON public.transacciones;
CREATE POLICY "Admin actualiza transacciones" ON public.transacciones
  FOR UPDATE USING (public.es_admin()) WITH CHECK (public.es_admin());

-- Vista de reportes
CREATE OR REPLACE VIEW public.v_transacciones_detalle AS
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
