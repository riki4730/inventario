export interface FilaImportacion {
  nombre: string;
  precio: number;
  stockInicial: number;
  entrada: number;
  transferencia: number;
  venta: number;
  total: number;
  categoria: string;
  subcategoria: string;
}

function cellText(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function cellNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/[$,]/g, "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normHeader(v: unknown): string {
  return cellText(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function classifyHeader(
  h: string
):
  | "nombre"
  | "precio"
  | "stock"
  | "entrada"
  | "transferencia"
  | "venta"
  | "total"
  | "categoria"
  | "subcategoria"
  | null {
  if (!h) return null;
  if (h.includes("nombre") || h.includes("producto")) return "nombre";
  if (h.includes("precio")) return "precio";
  if (h.includes("total")) return "total";
  if (h === "categoria" || h.startsWith("categoria")) return "categoria";
  if (h === "subcategoria" || h.startsWith("subcategoria")) return "subcategoria";
  if (h === "stock" || h.startsWith("stock") || h === "cantidad") return "stock";
  if (h.includes("entrada") || h.includes("ingreso")) return "entrada";
  if (h.includes("transfer") || h.includes("salida")) return "transferencia";
  if (h.includes("venta")) return "venta";
  return null;
}

type Span = { start: number; end: number };

/**
 * Interpreta la hoja: busca la fila de encabezados y suma grupos de 4 columnas
 * bajo Entrada / Salida-Transferencia / Venta (celdas combinadas del formato).
 * Tolera formatos mínimos: [Producto, Categoria, Subcategoria, Stock]
 */
export function parseInventarioSheet(
  rows: unknown[][],
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[]
): FilaImportacion[] {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i] ?? [];
    if (
      row.some(
        (c) => {
          const k = classifyHeader(normHeader(c));
          return k === "nombre" || k === "stock" || k === "categoria";
        }
      )
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error(
      'No se encontró la fila de encabezados (se espera al menos "Producto" o "Stock").'
    );
  }

  const header = rows[headerIdx] ?? [];
  const cols = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const spans: Partial<Record<NonNullable<ReturnType<typeof classifyHeader>>, Span>> = {};

  const mergeOnHeader = (merges ?? []).filter((m) => m.s.r <= headerIdx && m.e.r >= headerIdx);

  for (let c = 0; c < cols; c++) {
    const kind = classifyHeader(normHeader(header[c]));
    if (!kind) continue;
    const merge = mergeOnHeader.find((m) => m.s.c <= c && m.e.c >= c);
    const start = merge ? merge.s.c : c;
    const end = merge
      ? merge.e.c
      : kind === "entrada" || kind === "transferencia" || kind === "venta"
        ? c + 3
        : c;
    if (!spans[kind]) spans[kind] = { start, end };
  }

  for (const kind of ["entrada", "transferencia", "venta"] as const) {
    const s = spans[kind];
    if (s && s.end === s.start) s.end = Math.min(cols - 1, s.start + 3);
  }

  if (!spans.nombre && !spans.stock && !spans.categoria) {
    throw new Error(
      "Falta al menos una columna identificable (Nombre / Producto, Stock, Categoria)."
    );
  }

  function sumSpan(row: unknown[], span?: Span): number {
    if (!span) return 0;
    let total = 0;
    for (let c = span.start; c <= span.end; c++) {
      const n = cellNumber(row[c]);
      if (n > 0 && n < 100000) total += n;
    }
    return total;
  }

  function firstNumber(row: unknown[], span?: Span): number {
    if (!span) return 0;
    for (let c = span.start; c <= span.end; c++) {
      const raw = row[c];
      if (raw == null || raw === "") continue;
      return cellNumber(raw);
    }
    return 0;
  }

  function firstText(row: unknown[], span?: Span): string {
    if (!span) return "";
    for (let c = span.start; c <= span.end; c++) {
      const t = cellText(row[c]);
      if (t) return t;
    }
    return "";
  }

  const out: FilaImportacion[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];

    let nombre = spans.nombre ? cellText(row[spans.nombre.start]) : "";
    if (!nombre) {
      let idxFallback = spans.categoria
        ? Math.max(0, spans.categoria.start - 1)
        : spans.stock
          ? Math.max(0, spans.stock.start - 1)
          : 0;
      nombre = cellText(row[idxFallback]);
    }
    if (!nombre) continue;
    if (classifyHeader(normHeader(nombre))) continue;

    const precio = firstNumber(row, spans.precio);
    const stockInicial = firstNumber(row, spans.stock);
    const entrada = sumSpan(row, spans.entrada);
    const transferencia = sumSpan(row, spans.transferencia);
    const venta = sumSpan(row, spans.venta);
    const categoria = firstText(row, spans.categoria);
    const subcategoria = firstText(row, spans.subcategoria);

    let total = firstNumber(row, spans.total);
    if (!total) {
      if (stockInicial || entrada || transferencia || venta) {
        total = Math.max(0, stockInicial + entrada - transferencia - venta);
      } else {
        total = Math.max(0, stockInicial);
      }
    }

    out.push({
      nombre,
      precio,
      stockInicial,
      entrada,
      transferencia,
      venta,
      total,
      categoria,
      subcategoria,
    });
  }

  return out;
}
