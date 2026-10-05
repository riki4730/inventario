export type Rol = "admin" | "supervisor" | "trabajador";
export type TipoTransaccion = "entrada" | "salida" | "venta" | "transferencia";
export type FiltroMovimiento = "todos" | "entrada" | "venta" | "transferencia";

export interface Sucursal {
  id: string;
  nombre: string;
  direccion: string;
  activa?: boolean;
  created_at?: string;
}

export interface PerfilUsuario {
  id: string;
  nombre: string;
  rol: Rol;
  sucursal_id: string | null;
  created_at?: string;
  sucursales?: Sucursal | null;
}

export interface Modelo {
  id: string;
  nombre: string;
  descripcion: string;
  imagen_url: string | null;
  precio: number;
  categoria?: string;
  subcategoria?: string;
  activo?: boolean;
  created_at?: string;
}

export interface InventarioSucursal {
  id: string;
  sucursal_id: string;
  modelo_id: string;
  cantidad: number;
  updated_at?: string;
  modelos?: Modelo;
  sucursales?: Sucursal;
}

export interface Transaccion {
  id: string;
  inventario_id: string;
  tipo: TipoTransaccion;
  cantidad: number;
  fecha_hora: string;
  usuario_id: string | null;
  sucursal_destino_id?: string | null;
  es_historico?: boolean;
}

export interface TransaccionDetalle {
  id: string;
  tipo: TipoTransaccion;
  cantidad: number;
  fecha_hora: string;
  usuario_id: string;
  usuario_nombre: string | null;
  sucursal_id: string;
  sucursal_nombre: string;
  modelo_id: string;
  modelo_nombre: string;
  imagen_url: string | null;
}

export interface InventarioMacroItem {
  modelo_id: string;
  nombre: string;
  descripcion: string;
  imagen_url: string | null;
  categoria?: string;
  subcategoria?: string;
  total: number;
}
