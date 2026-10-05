-- =============================================================================
-- Correcciones puntuales (vista security_invoker, triggers, backfill, RLS)
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- 1) Vista de reportes: SECURITY INVOKER (respeta RLS del usuario que consulta)
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

-- 2) Al crear un modelo: inventario 0 en todas las sucursales
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

-- 3) Al crear una sucursal: inventario 0 para todos los modelos
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

-- 4) Completar filas que falten (sucursales/productos ya existentes)
INSERT INTO public.inventario_sucursal (sucursal_id, modelo_id, cantidad)
SELECT s.id, m.id, 0
FROM public.sucursales s
CROSS JOIN public.modelos m
ON CONFLICT (sucursal_id, modelo_id) DO NOTHING;

-- 5) El trabajador puede crear la fila de inventario de su sucursal (entrada a stock 0)
DROP POLICY IF EXISTS "Trabajador inserta inventario de su sucursal" ON public.inventario_sucursal;
CREATE POLICY "Trabajador inserta inventario de su sucursal" ON public.inventario_sucursal
  FOR INSERT TO authenticated
  WITH CHECK (
    sucursal_id = public.get_mi_sucursal()
    AND cantidad >= 0
  );
