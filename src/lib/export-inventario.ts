import { formatMoney } from "@/lib/format";

export interface FilaExportacion {
  categoria: string;
  subcategoria: string;
  producto: string;
  stock: number;
  sucursal: string;
  precio: number;
}

export function etiquetaGrupo(valor: string | null | undefined, vacio: string): string {
  const t = (valor ?? "").trim();
  return t || vacio;
}

export function ordenarFilasExport(filas: FilaExportacion[]): FilaExportacion[] {
  return [...filas].sort((a, b) => {
    const c = a.categoria.localeCompare(b.categoria, "es");
    if (c !== 0) return c;
    const s = a.subcategoria.localeCompare(b.subcategoria, "es");
    if (s !== 0) return s;
    return a.producto.localeCompare(b.producto, "es");
  });
}

export async function descargarExcelInventario(
  filas: FilaExportacion[],
  meta: { sucursal: string; desde: string; hasta: string }
) {
  const XLSX = await import("xlsx");
  const ordenadas = ordenarFilasExport(filas);
  const aoa: (string | number)[][] = [
    ["Inventario"],
    ["Sucursal", meta.sucursal],
    ["Desde", meta.desde || "—"],
    ["Hasta", meta.hasta || "—"],
    [],
    ["Categoría", "Subcategoría", "Producto", "Stock", "Sucursal", "Precio"],
  ];

  let cat = "";
  let sub = "";
  for (const f of ordenadas) {
    if (f.categoria !== cat) {
      cat = f.categoria;
      sub = "";
      aoa.push([`CATEGORÍA: ${cat}`, "", "", "", "", ""]);
    }
    if (f.subcategoria !== sub) {
      sub = f.subcategoria;
      aoa.push(["", `Subcategoría: ${sub}`, "", "", "", ""]);
    }
    aoa.push([f.categoria, f.subcategoria, f.producto, f.stock, f.sucursal, f.precio]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventario");
  XLSX.writeFile(wb, `inventario-${stamp()}.xlsx`);
}

export async function descargarPdfInventario(
  filas: FilaExportacion[],
  meta: { sucursal: string; desde: string; hasta: string }
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const ordenadas = ordenarFilasExport(filas);

  doc.setFontSize(16);
  doc.text("Inventario", 14, 14);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Sucursal: ${meta.sucursal}`, 14, 22);
  doc.text(`Desde: ${meta.desde || "—"}  ·  Hasta: ${meta.hasta || "—"}`, 14, 28);
  doc.setTextColor(0);

  type BodyRow = {
    cells: string[];
    tipo: "cat" | "sub" | "dato";
  };

  const body: BodyRow[] = [];
  let cat = "";
  let sub = "";
  for (const f of ordenadas) {
    if (f.categoria !== cat) {
      cat = f.categoria;
      sub = "";
      body.push({ cells: [`CATEGORÍA: ${cat}`, "", "", "", "", ""], tipo: "cat" });
    }
    if (f.subcategoria !== sub) {
      sub = f.subcategoria;
      body.push({ cells: [`  Subcategoría: ${sub}`, "", "", "", "", ""], tipo: "sub" });
    }
    body.push({
      cells: [
        f.categoria,
        f.subcategoria,
        f.producto,
        String(f.stock),
        f.sucursal,
        formatMoney(f.precio),
      ],
      tipo: "dato",
    });
  }

  autoTable(doc, {
    startY: 34,
    head: [["Categoría", "Subcategoría", "Producto", "Stock", "Sucursal", "Precio"]],
    body: body.map((r) => r.cells),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [13, 148, 136] },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const row = body[data.row.index];
      if (!row) return;
      if (row.tipo === "cat") {
        data.cell.styles.fillColor = [15, 118, 110];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      }
      if (row.tipo === "sub") {
        data.cell.styles.fillColor = [204, 251, 241];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  doc.save(`inventario-${stamp()}.pdf`);
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}
