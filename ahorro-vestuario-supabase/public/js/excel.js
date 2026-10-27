// =============================================================
//  EXCEL CON DISEÑO (.xlsx)
//  Crea un libro con dos hojas:
//   1. Resumen      → logo, totales del colectivo y avance por integrante
//   2. Movimientos  → cada ahorro anotado, con su estado
//  Usa la librería ExcelJS (js/vendor/exceljs.min.js), que se carga
//  solo cuando alguien toca "Descargar Excel".
// =============================================================
(function () {
  "use strict";

  // Colores del carnaval (formato ARGB que usa Excel)
  const C = {
    negro: "FF120B18", blanco: "FFFFFFFF", tinta: "FF1A1022", gris: "FF675C70", linea: "FFE6E0EC",
    fondoSuave: "FFF6F3F9", fila: "FFFBF9FC",
    fucsia: "FFD6006F", amarillo: "FFFFB800", turquesa: "FF00939C", naranja: "FFF2541B", verde: "FF23893C", morado: "FF5B2A86",
    verdeSuave: "FFDDF2E1", amarilloSuave: "FFFFF2CC", fucsiaSuave: "FFFCE3F0", grisSuave: "FFEFEDF2"
  };
  const SERPENTINA = [C.fucsia, C.amarillo, C.turquesa, C.naranja, C.verde, C.morado];
  const PESOS = '"$" #,##0';
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  // ---------- Cargar la librería solo cuando se necesita ----------
  let cargando = null;
  function cargarExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (cargando) return cargando;
    cargando = new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = "js/vendor/exceljs.min.js";
      s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : mal(new Error("ExcelJS no cargó"));
      s.onerror = () => { cargando = null; mal(new Error("No se pudo cargar ExcelJS")); };
      document.head.appendChild(s);
    });
    return cargando;
  }

  async function imagenBase64(url) {
    try {
      const r = await fetch(url); if (!r.ok) return null;
      const blob = await r.blob();
      return await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => ok(null); fr.readAsDataURL(blob); });
    } catch (_) { return null; }
  }

  // ---------- Ayudas de estilo ----------
  const relleno = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const borde = (argb = C.linea) => ({ top: { style: "thin", color: { argb } }, bottom: { style: "thin", color: { argb } }, left: { style: "thin", color: { argb } }, right: { style: "thin", color: { argb } } });
  const fechaLarga = d => d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear();
  const aFecha = iso => { if (!iso) return null; const [y, m, d] = String(iso).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };

  function banda(ws, filaIni, filaFin, colIni, colFin, argb) {
    for (let r = filaIni; r <= filaFin; r++) for (let c = colIni; c <= colFin; c++) ws.getCell(r, c).fill = relleno(argb);
  }
  function serpentina(ws, fila, colIni, colFin) {
    ws.getRow(fila).height = 6;
    for (let c = colIni, k = 0; c <= colFin; c++, k++) ws.getCell(fila, c).fill = relleno(SERPENTINA[k % SERPENTINA.length]);
  }
  function encabezadoTabla(ws, fila, titulos, izquierda = [0]) {
    const r = ws.getRow(fila); r.height = 24;
    titulos.forEach((t, i) => {
      const c = r.getCell(2 + i);
      c.value = t;
      c.font = { name: "Calibri", bold: true, color: { argb: C.blanco }, size: 11 };
      c.fill = relleno(C.negro);
      const izq = izquierda.includes(i);
      c.alignment = { vertical: "middle", horizontal: izq ? "left" : "center", indent: izq ? 1 : 0 };
      c.border = borde(C.negro);
    });
  }

  // =============================================================
  //  Construir el libro
  //  datos = { colectivo, fechaDesfile, integrantes:[{nombre, meta, ahorrado, confirmado}],
  //            movimientos:[{fecha, integrante, valor, medio, estado, nota, anotadoPor, recibidoPor}] }
  // =============================================================
  async function construirLibro(ExcelJS, datos, logoBase64) {
    const wb = new ExcelJS.Workbook();
    wb.creator = datos.colectivo || "Danzantes del Cerrillo";
    wb.created = new Date();
    const hoy = new Date();

    // ================= HOJA 1: RESUMEN =================
    const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.fucsia } } });
    ws.columns = [
      { width: 2.5 }, { width: 30 }, { width: 15 }, { width: 15 }, { width: 15 },
      { width: 15 }, { width: 15 }, { width: 10 }, { width: 16 }, { width: 15 }
    ];
    const ULT = 10; // última columna usada (J)

    // Banda negra con logo y título
    banda(ws, 1, 4, 1, ULT, C.negro);
    [1, 2, 3, 4].forEach(r => ws.getRow(r).height = r === 1 || r === 4 ? 12 : 30);
    if (logoBase64) {
      const id = wb.addImage({ base64: logoBase64, extension: "png" });
      ws.addImage(id, { tl: { col: 1.15, row: 0.6 }, ext: { width: 132, height: 65 } });
    }
    ws.mergeCells(2, 3, 2, 8);
    const t1 = ws.getCell(2, 3);
    t1.value = "Ahorro del vestuario";
    t1.font = { name: "Calibri", size: 20, bold: true, color: { argb: C.blanco } };
    t1.alignment = { vertical: "bottom" };
    ws.mergeCells(3, 3, 3, 8);
    const t2 = ws.getCell(3, 3);
    t2.value = (datos.colectivo || "Danzantes del Cerrillo") + "  ·  Carnaval de Negros y Blancos";
    t2.font = { name: "Calibri", size: 11, color: { argb: "FFC9BED3" } };
    t2.alignment = { vertical: "top" };
    ws.mergeCells(2, 9, 2, 10);
    const t3 = ws.getCell(2, 9);
    t3.value = "Generado";
    t3.font = { name: "Calibri", size: 9, color: { argb: "FFC9BED3" } };
    t3.alignment = { horizontal: "right", vertical: "bottom" };
    ws.mergeCells(3, 9, 3, 10);
    const t4 = ws.getCell(3, 9);
    t4.value = fechaLarga(hoy);
    t4.font = { name: "Calibri", size: 11, bold: true, color: { argb: C.amarillo } };
    t4.alignment = { horizontal: "right", vertical: "top" };
    serpentina(ws, 5, 1, ULT);

    // ---- Tabla por integrante (se arma primero para que los totales la usen) ----
    const FILA_ENC = 13, primera = FILA_ENC + 1;
    const lista = datos.integrantes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const ultima = primera + Math.max(lista.length, 1) - 1;
    const filaTot = ultima + 1;

    // ---- Tarjetas de totales (fórmulas que leen la tabla) ----
    ws.getRow(7).height = 18; ws.getRow(8).height = 34; ws.getRow(9).height = 18;
    const tarjetas = [
      { cols: [2, 3], titulo: "Ahorrado entre todos", formula: `D${filaTot}`, formato: PESOS, color: C.fucsia, nota: "de $ " + lista.reduce((t, p) => t + (p.meta || 0), 0).toLocaleString("es-CO") + " de meta" },
      { cols: [4, 5], titulo: "Confirmado por tesorería", formula: `E${filaTot}`, formato: PESOS, color: C.verde, nota: "Ya recibido" },
      { cols: [6, 7], titulo: "Por confirmar", formula: `F${filaTot}`, formato: PESOS, color: C.amarillo, nota: "Anotado por integrantes" },
      { cols: [8, 10], titulo: "Avance del colectivo", formula: `IFERROR(D${filaTot}/C${filaTot},0)`, formato: "0%", color: C.turquesa, nota: `=COUNTIF(J${primera}:J${ultima},"Cumplió")&" de "&COUNTA(B${primera}:B${ultima})&" cumplieron la meta"` }
    ];
    tarjetas.forEach(t => {
      const [a, b] = [t.cols[0], t.cols[t.cols.length - 1]];
      [7, 8, 9].forEach(r => { ws.mergeCells(r, a, r, b); });
      for (let r = 7; r <= 9; r++) for (let c = a; c <= b; c++) {
        const cel = ws.getCell(r, c);
        cel.fill = relleno(C.fondoSuave);
        cel.border = { left: c === a ? { style: "thick", color: { argb: t.color } } : undefined };
      }
      const e = ws.getCell(7, a);
      e.value = t.titulo.toUpperCase();
      e.font = { name: "Calibri", size: 8.5, bold: true, color: { argb: C.gris } };
      e.alignment = { indent: 1, vertical: "bottom" };
      const v = ws.getCell(8, a);
      v.value = { formula: t.formula };
      v.numFmt = t.formato;
      v.font = { name: "Calibri", size: 20, bold: true, color: { argb: C.tinta } };
      v.alignment = { indent: 1, vertical: "middle", horizontal: "left" };
      const n = ws.getCell(9, a);
      n.value = t.nota.startsWith("=") ? { formula: t.nota.slice(1) } : t.nota;
      n.font = { name: "Calibri", size: 9, color: { argb: C.gris } };
      n.alignment = { indent: 1, vertical: "top" };
    });

    // ---- Título de la tabla ----
    ws.mergeCells(11, 2, 11, 6);
    const st = ws.getCell(11, 2);
    st.value = "Avance por integrante";
    st.font = { name: "Calibri", size: 14, bold: true, color: { argb: C.tinta } };
    ws.mergeCells(11, 7, 11, 10);
    const dias = Math.round((aFecha(datos.fechaDesfile) - Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000);
    const sd = ws.getCell(11, 7);
    sd.value = dias > 0 ? `Faltan ${dias} días para el desfile` : dias === 0 ? "¡Hoy es el desfile!" : "El desfile ya pasó";
    sd.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.fucsia } };
    sd.alignment = { horizontal: "right" };

    encabezadoTabla(ws, FILA_ENC, ["Integrante", "Meta", "Ahorrado", "Confirmado", "Por confirmar", "Falta", "Avance", "Progreso", "Estado"]);

    if (!lista.length) {
      ws.mergeCells(primera, 2, primera, 10);
      const c = ws.getCell(primera, 2);
      c.value = "Todavía no hay integrantes registrados.";
      c.font = { italic: true, color: { argb: C.gris } };
    }
    lista.forEach((p, k) => {
      const r = primera + k, row = ws.getRow(r);
      row.height = 21;
      const fondo = k % 2 ? C.fila : C.blanco;
      const pendiente = Math.max(0, (p.ahorrado || 0) - (p.confirmado || 0));
      const valores = [
        p.nombre, p.meta || 0, p.ahorrado || 0, p.confirmado || 0, pendiente,
        { formula: `MAX(0,C${r}-D${r})` },
        { formula: `IFERROR(MIN(1,D${r}/C${r}),0)` },
        { formula: `REPT("█",ROUND(H${r}*10,0))&REPT("░",10-ROUND(H${r}*10,0))` },
        null
      ];
      const cumplio = p.meta > 0 && p.ahorrado >= p.meta;
      const estado = cumplio ? ["Cumplió", C.verdeSuave, C.verde] : p.ahorrado > 0 ? ["En camino", C.amarilloSuave, "FF8A5A00"] : ["Sin ahorros", C.grisSuave, C.gris];
      valores[8] = estado[0];
      valores.forEach((v, i) => {
        const c = row.getCell(2 + i);
        c.value = v;
        c.fill = relleno(fondo);
        c.border = { bottom: { style: "thin", color: { argb: C.linea } } };
        c.font = { name: "Calibri", size: 11, color: { argb: C.tinta } };
        c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", indent: i === 0 ? 1 : 0 };
        if (i >= 1 && i <= 5) c.numFmt = PESOS;
      });
      row.getCell(2).font = { name: "Calibri", size: 11, bold: true, color: { argb: C.tinta } };
      row.getCell(7).font = { name: "Calibri", size: 11, bold: true, color: { argb: C.fucsia } };
      row.getCell(8).numFmt = "0%";
      row.getCell(8).font = { name: "Calibri", size: 11, bold: true, color: { argb: C.tinta } };
      row.getCell(9).font = { name: "Consolas", size: 9, color: { argb: cumplio ? C.verde : C.fucsia } };
      const ce = row.getCell(10);
      ce.fill = relleno(estado[1]);
      ce.font = { name: "Calibri", size: 10, bold: true, color: { argb: estado[2] } };
    });

    // Fila de totales
    const rt = ws.getRow(filaTot); rt.height = 24;
    const totales = ["Total del colectivo", { formula: `SUM(C${primera}:C${ultima})` }, { formula: `SUM(D${primera}:D${ultima})` },
      { formula: `SUM(E${primera}:E${ultima})` }, { formula: `SUM(F${primera}:F${ultima})` }, { formula: `SUM(G${primera}:G${ultima})` },
      { formula: `IFERROR(MIN(1,D${filaTot}/C${filaTot}),0)` }, { formula: `REPT("█",ROUND(H${filaTot}*10,0))&REPT("░",10-ROUND(H${filaTot}*10,0))` }, ""];
    totales.forEach((v, i) => {
      const c = rt.getCell(2 + i);
      c.value = v;
      c.fill = relleno(C.fucsiaSuave);
      c.border = { top: { style: "medium", color: { argb: C.fucsia } }, bottom: { style: "medium", color: { argb: C.fucsia } } };
      c.font = { name: "Calibri", size: 11, bold: true, color: { argb: i === 7 ? C.fucsia : C.tinta } };
      c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", indent: i === 0 ? 1 : 0 };
      if (i >= 1 && i <= 5) c.numFmt = PESOS;
      if (i === 6) c.numFmt = "0%";
    });
    rt.getCell(9).font = { name: "Consolas", size: 9, bold: true, color: { argb: C.fucsia } };

    // Pie
    const pie = ws.getCell(filaTot + 2, 2);
    pie.value = "“Por confirmar” son ahorros que el integrante anotó y la tesorería aún no ha recibido.";
    pie.font = { name: "Calibri", size: 9, italic: true, color: { argb: C.gris } };

    ws.views = [{ state: "frozen", ySplit: FILA_ENC, showGridLines: false }];
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    ws.pageSetup.printTitlesRow = `${FILA_ENC}:${FILA_ENC}`;

    // ================= HOJA 2: MOVIMIENTOS =================
    const wm = wb.addWorksheet("Movimientos", { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.turquesa } } });
    wm.columns = [{ width: 2.5 }, { width: 13 }, { width: 28 }, { width: 14 }, { width: 15 }, { width: 15 }, { width: 30 }, { width: 22 }, { width: 22 }];
    const UM = 9;
    banda(wm, 1, 3, 1, UM, C.negro);
    wm.getRow(1).height = 10; wm.getRow(2).height = 30; wm.getRow(3).height = 10;
    wm.mergeCells(2, 2, 2, 6);
    const mt = wm.getCell(2, 2);
    mt.value = "Movimientos de ahorro";
    mt.font = { name: "Calibri", size: 18, bold: true, color: { argb: C.blanco } };
    mt.alignment = { vertical: "middle", indent: 0 };
    wm.mergeCells(2, 7, 2, 9);
    const mt2 = wm.getCell(2, 7);
    mt2.value = (datos.colectivo || "") + "  ·  " + fechaLarga(hoy);
    mt2.font = { name: "Calibri", size: 10, color: { argb: "FFC9BED3" } };
    mt2.alignment = { horizontal: "right", vertical: "middle" };
    serpentina(wm, 4, 1, UM);

    const ME = 6;
    encabezadoTabla(wm, ME, ["Fecha", "Integrante", "Valor", "Medio", "Estado", "Nota", "Anotado por", "Recibido por"], [1, 5, 6, 7]);
    const movs = datos.movimientos.slice().sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || a.integrante.localeCompare(b.integrante, "es"));
    movs.forEach((m, k) => {
      const r = ME + 1 + k, row = wm.getRow(r); row.height = 20;
      const fondo = k % 2 ? C.fila : C.blanco;
      const recibido = m.estado === "recibido";
      [aFecha(m.fecha), m.integrante, m.valor, m.medio || "", recibido ? "Recibido" : "Por confirmar", m.nota || "", m.anotadoPor || "", m.recibidoPor || ""]
        .forEach((v, i) => {
          const c = row.getCell(2 + i);
          c.value = v;
          c.fill = relleno(fondo);
          c.border = { bottom: { style: "thin", color: { argb: C.linea } } };
          c.font = { name: "Calibri", size: 11, color: { argb: C.tinta } };
          c.alignment = { vertical: "middle", horizontal: [0, 2, 3, 4].includes(i) ? "center" : "left", indent: [1, 5, 6, 7].includes(i) ? 1 : 0, wrapText: i === 5 };
        });
      row.getCell(2).numFmt = "dd/mm/yyyy";
      row.getCell(3).font = { name: "Calibri", size: 11, bold: true, color: { argb: C.tinta } };
      row.getCell(4).numFmt = PESOS;
      const ce = row.getCell(6);
      ce.fill = relleno(recibido ? C.verdeSuave : C.amarilloSuave);
      ce.font = { name: "Calibri", size: 10, bold: true, color: { argb: recibido ? C.verde : "FF8A5A00" } };
    });
    const mUlt = ME + Math.max(movs.length, 1);
    if (!movs.length) {
      wm.mergeCells(ME + 1, 2, ME + 1, UM);
      const c = wm.getCell(ME + 1, 2);
      c.value = "Todavía no hay ahorros anotados.";
      c.font = { italic: true, color: { argb: C.gris } };
    }
    const mt3 = wm.getRow(mUlt + 1); mt3.height = 22;
    [["Total", 3], [{ formula: `SUM(D${ME + 1}:D${mUlt})` }, 4]].forEach(([v, col]) => {
      const c = mt3.getCell(col); c.value = v;
      c.font = { name: "Calibri", size: 11, bold: true, color: { argb: C.tinta } };
      c.alignment = { horizontal: col === 3 ? "right" : "center", vertical: "middle", indent: col === 3 ? 1 : 0 };
    });
    mt3.getCell(4).numFmt = PESOS;
    for (let c = 2; c <= UM; c++) {
      const cel = mt3.getCell(c);
      cel.fill = relleno(C.fucsiaSuave);
      cel.border = { top: { style: "medium", color: { argb: C.fucsia } }, bottom: { style: "medium", color: { argb: C.fucsia } } };
    }
    if (movs.length) wm.autoFilter = { from: { row: ME, column: 2 }, to: { row: mUlt, column: UM } };
    wm.views = [{ state: "frozen", ySplit: ME, showGridLines: false }];
    wm.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    wm.pageSetup.printTitlesRow = `${ME}:${ME}`;

    return wb;
  }

  // ---------- Función pública: crea y descarga el archivo ----------
  window.exportarExcel = async function (datos) {
    const ExcelJS = await cargarExcelJS();
    const logo = await imagenBase64("img/logo-claro.png");
    const wb = await construirLibro(ExcelJS, datos, logo);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const limpio = (datos.colectivo || "colectivo").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const d = new Date();
    a.href = url; a.download = `ahorro-${limpio}-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  // Para pruebas fuera del navegador
  window.__construirLibroExcel = construirLibro;
})();
