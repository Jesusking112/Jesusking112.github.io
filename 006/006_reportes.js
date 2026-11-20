// 006 · Reportes en PDF del administrador del conjunto.
// Usa solo operaciones que ya existen en la Edge Function (adm_*), así que no requiere cambios en Supabase.
// El PDF se genera con el diálogo de impresión del navegador ("Guardar como PDF"): no depende de librerías externas.
(function () {
  "use strict";
  const C = window.Conj;
  if (!C || C.rol() !== "admin" || !document.querySelector('[data-panel="reportes"]')) return;
  const $ = C.$, $$ = C.$$, esc = C.esc, din = C.dinero;

  // ------------------------------------------------------------------ rango de fechas
  const desdeEl = $("#rp-desde"), hastaEl = $("#rp-hasta"), casaEl = $("#rp-casa");
  const hoy = C.hoy();
  function ponerRango(tipo) {
    const [a, m] = hoy.split("-").map(Number);
    const ini = (y, mm) => y + "-" + String(mm).padStart(2, "0") + "-01";
    const fin = (y, mm) => new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
    let d, h;
    if (tipo === "mes") { d = ini(a, m); h = hoy; }
    else if (tipo === "anterior") { const y = m === 1 ? a - 1 : a, mm = m === 1 ? 12 : m - 1; d = ini(y, mm); h = fin(y, mm); }
    else if (tipo === "trimestre") { const t = new Date(Date.UTC(a, m - 3, 1)); d = ini(t.getUTCFullYear(), t.getUTCMonth() + 1); h = hoy; }
    else if (tipo === "semestre") { const t = new Date(Date.UTC(a, m - 6, 1)); d = ini(t.getUTCFullYear(), t.getUTCMonth() + 1); h = hoy; }
    else if (tipo === "anio") { d = a + "-01-01"; h = hoy; }
    else if (tipo === "anio_ant") { d = (a - 1) + "-01-01"; h = (a - 1) + "-12-31"; }
    desdeEl.value = d; hastaEl.value = h;
    $$("#rp-rangos [data-r]").forEach((b) => b.classList.toggle("on", b.dataset.r === tipo));
  }
  ponerRango("mes");
  $("#rp-rangos").addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (b) ponerRango(b.dataset.r); });
  [desdeEl, hastaEl].forEach((el) => el.addEventListener("change", () => $$("#rp-rangos [data-r]").forEach((b) => b.classList.remove("on"))));

  function rango() {
    let d = desdeEl.value, h = hastaEl.value;
    if (!d || !h) throw new Error("Elige la fecha inicial y final del reporte");
    if (d > h) [d, h] = [h, d];
    return { desde: d, hasta: h };
  }
  const periodo = (f) => f.slice(0, 7);
  function periodosEntre(d, h) {
    const out = []; let [a, m] = periodo(d).split("-").map(Number);
    const fin = periodo(h);
    for (let i = 0; i < 120; i++) {
      const p = a + "-" + String(m).padStart(2, "0");
      out.push(p); if (p >= fin) break;
      m++; if (m > 12) { m = 1; a++; }
    }
    return out;
  }
  // Fecha local (Bogotá) de un timestamptz.
  const diaTs = (ts) => (ts ? new Date(new Date(ts).getTime() - 5 * 3600e3).toISOString().slice(0, 10) : "");
  const fechaHora = (ts) => (ts ? new Date(ts).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const suma = (l, f) => l.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : 0);
  const METODOS = { efectivo: "Efectivo", transferencia: "Transferencia", nequi: "Nequi", daviplata: "Daviplata", consignacion: "Consignación", tarjeta: "Tarjeta", llave: "Llave Bre-B" };
  const metodo = (m) => METODOS[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : "—");
  const ESTV = { por_autorizar: "Esperando respuesta", esperado: "Autorizado", adentro: "Adentro", salio: "Salió", rechazado: "No autorizado", cancelado: "Cancelado" };

  // ------------------------------------------------------------------ datos
  let cache = null;
  async function datos(r) {
    const clave = r.desde + "|" + r.hasta;
    if (cache && cache.clave === clave && Date.now() - cache.t < 60000) return cache.d;
    const [conj, casasR, pagos, movs, cobros, porteria] = await Promise.all([
      C.llamar("adm_conjunto"),
      C.llamar("adm_casas", { periodo: periodo(r.hasta > hoy ? hoy : r.hasta) }),
      C.llamar("adm_pagos", { desde: r.desde, hasta: r.hasta }),
      C.llamar("adm_movs", { desde: r.desde, hasta: r.hasta }),
      C.llamar("adm_cobros", {}),
      C.llamar("adm_porteria", { desde: r.desde, hasta: r.hasta }),
    ]);
    const casas = casasR.casas || [];
    const porId = new Map(casas.map((c) => [c.id, c]));
    const pers = periodosEntre(r.desde, r.hasta);
    const setPer = new Set(pers);
    const d = {
      conj, casas, porId, pers, cobrosTodos: cobros,
      cobros: cobros.filter((c) => setPer.has(c.periodo)),
      pagos, aprobados: pagos.filter((p) => p.estado === "aprobado"),
      movs, visitas: porteria.visitas || [], paquetes: porteria.paquetes || [],
    };
    cache = { clave, t: Date.now(), d };
    llenarCasas(casas);
    return d;
  }
  const casaTxt = (d, id) => { const c = d.porId.get(id); return c ? c.codigo : "—"; };
  const propTxt = (d, id) => { const c = d.porId.get(id); return (c && c.propietario) || ""; };

  function llenarCasas(casas) {
    const actual = casaEl.value;
    casaEl.innerHTML = '<option value="">Elige una casa…</option>' + casas.map((c) =>
      '<option value="' + c.id + '">' + esc(c.codigo + (c.propietario ? " · " + c.propietario : "")) + "</option>").join("");
    if (actual) casaEl.value = actual;
  }
  C.llamar("adm_casas", { periodo: C.periodoActual() }).then((r) => llenarCasas(r.casas || [])).catch(() => {});

  // ------------------------------------------------------------------ piezas del documento
  const n = (v) => '<td class="n">' + din(v) + "</td>";
  function tabla(cab, filas, opts) {
    opts = opts || {};
    const der = new Set(opts.der || []);
    const th = cab.map((h, i) => "<th" + (der.has(i) ? ' class="n"' : "") + ">" + esc(h) + "</th>").join("");
    const cuerpo = filas.length
      ? filas.map((f) => "<tr>" + f.map((c, i) => (typeof c === "string" && c.startsWith("<td") ? c : "<td" + (der.has(i) ? ' class="n"' : "") + ">" + esc(c == null ? "" : c) + "</td>")).join("") + "</tr>").join("")
      : '<tr><td colspan="' + cab.length + '" class="vacio">Sin registros en este rango.</td></tr>';
    const pie = opts.pie ? "<tfoot><tr>" + opts.pie.map((c, i) => (typeof c === "string" && c.startsWith("<td") ? c : "<td" + (der.has(i) ? ' class="n"' : "") + ">" + esc(c == null ? "" : c) + "</td>")).join("") + "</tr></tfoot>" : "";
    return '<table><thead><tr>' + th + "</tr></thead><tbody>" + cuerpo + "</tbody>" + pie + "</table>";
  }
  function kpis(items) {
    return '<div class="kpis">' + items.map((k) => '<div class="kpi ' + (k[3] || "") + '"><span>' + esc(k[0]) + "</span><b>" + esc(k[1]) + "</b>" + (k[2] ? "<small>" + esc(k[2]) + "</small>" : "") + "</div>").join("") + "</div>";
  }
  function barras(items, color) {
    const max = Math.max(1, ...items.map((x) => x.valor));
    if (!items.length) return '<p class="vacio">Sin datos para graficar.</p>';
    return '<div class="barras">' + items.map((x) =>
      '<div class="fila-b"><span class="et">' + esc(x.etq) + '</span><span class="pista"><i style="width:' + Math.max(1.5, (100 * x.valor) / max) + "%;background:" + (x.color || color || "#1e40af") + '"></i></span><span class="vl">' + esc(x.texto || din(x.valor)) + "</span></div>").join("") + "</div>";
  }
  function dobles(items) {
    const max = Math.max(1, ...items.flatMap((x) => [x.a, x.b]));
    if (!items.length) return '<p class="vacio">Sin datos para graficar.</p>';
    return '<div class="cols">' + items.map((x) =>
      '<div class="col"><div class="par"><i class="a" style="height:' + (100 * x.a) / max + '%" title="' + esc(din(x.a)) + '"></i><i class="b" style="height:' + (100 * x.b) / max + '%" title="' + esc(din(x.b)) + '"></i></div><span>' + esc(x.etq) + "</span></div>").join("") + "</div>" +
      '<p class="ley"><i class="a"></i>' + esc(items.ley[0]) + ' <i class="b"></i>' + esc(items.ley[1]) + "</p>";
  }
  const sec = (t, html, nota) => '<section class="sec"><h2>' + esc(t) + "</h2>" + (nota ? '<p class="nota">' + esc(nota) + "</p>" : "") + html + "</section>";
  function agrupar(lista, clave, valor) {
    const m = new Map();
    for (const x of lista) { const k = clave(x) || "Sin categoría"; m.set(k, (m.get(k) || 0) + (Number(valor(x)) || 0)); }
    return [...m.entries()].map(([etq, v]) => ({ etq, valor: v })).sort((a, b) => b.valor - a.valor);
  }

  // ------------------------------------------------------------------ cálculos compartidos
  function totales(d) {
    const facturado = suma(d.cobros, (c) => c.monto);
    const abonado = suma(d.cobros, (c) => c.pagado);
    const recaudado = suma(d.aprobados, (p) => p.monto);
    const otros = suma(d.movs.filter((m) => m.tipo === "ingreso"), (m) => m.monto);
    const egresos = suma(d.movs.filter((m) => m.tipo === "egreso"), (m) => m.monto);
    const activas = d.casas.filter((c) => c.activa);
    return {
      facturado, abonado, recaudado, otros, egresos, entradas: recaudado + otros, neto: recaudado + otros - egresos,
      cartera: suma(activas, (c) => c.deuda), vencida: suma(activas, (c) => c.vencido),
      morosas: activas.filter((c) => c.vencido > 0).length, activas: activas.length,
      alDia: activas.filter((c) => c.deuda <= 0).length,
      porValidar: d.pagos.filter((p) => p.estado === "por_validar"),
    };
  }
  function porMes(d) {
    return d.pers.map((p) => {
      const cob = d.cobros.filter((c) => c.periodo === p);
      const rec = suma(d.aprobados.filter((x) => periodo(diaTs(x.creado_at)) === p), (x) => x.monto);
      const otros = suma(d.movs.filter((m) => m.tipo === "ingreso" && periodo(m.fecha) === p), (m) => m.monto);
      const eg = suma(d.movs.filter((m) => m.tipo === "egreso" && periodo(m.fecha) === p), (m) => m.monto);
      return { p, facturado: suma(cob, (c) => c.monto), abonado: suma(cob, (c) => c.pagado), recaudado: rec, otros, egresos: eg, neto: rec + otros - eg };
    });
  }
  function pendientesPorCasa(d) {
    const m = new Map();
    for (const c of d.cobrosTodos) {
      const falta = Number(c.monto) - Number(c.pagado);
      if (falta <= 0) continue;
      const x = m.get(c.casa_id) || { meses: new Set(), viejo: c.periodo, vencido: 0 };
      x.meses.add(c.periodo);
      if (c.periodo < x.viejo) x.viejo = c.periodo;
      m.set(c.casa_id, x);
    }
    return m;
  }

  // ------------------------------------------------------------------ reportes
  const REPORTES = [
    {
      id: "general", titulo: "Informe de gestión completo", icono: "IG", destacado: true,
      desc: "Todo en un solo documento: finanzas, recaudo, cartera, caja, servicios y portería. Ideal para la asamblea o el consejo.",
      armar(d) {
        const t = totales(d), meses = porMes(d);
        const ley = ["Facturado", "Recaudado"];
        const serie = meses.map((m) => ({ etq: C.mesCorto(m.p), a: m.facturado, b: m.recaudado })); serie.ley = ley;
        const morosos = d.casas.filter((c) => c.activa && c.deuda > 0).sort((a, b) => b.deuda - a.deuda).slice(0, 15);
        return kpis([
          ["Facturado", din(t.facturado), d.cobros.length + " cobros generados"],
          ["Recaudado", din(t.recaudado), pct(t.abonado, t.facturado) + "% de lo facturado", "ok"],
          ["Otros ingresos", din(t.otros), "salón, multas, etc."],
          ["Gastos", din(t.egresos), "egresos de caja", "mal"],
          ["Resultado del periodo", din(t.neto), "entradas menos gastos", t.neto >= 0 ? "ok" : "mal"],
          ["Cartera actual", din(t.cartera), t.morosas + " casas en mora · " + din(t.vencida) + " vencido", "mal"],
          ["Casas al día", t.alDia + " de " + t.activas, pct(t.alDia, t.activas) + "% de las casas activas", "ok"],
          ["Pagos por validar", String(t.porValidar.length), din(suma(t.porValidar, (p) => p.monto)) + " sin revisar", "warn"],
        ]) +
          sec("Facturado vs. recaudado por mes", dobles(serie)) +
          sec("Resumen mensual", tabla(["Mes", "Facturado", "Recaudado", "Otros ingresos", "Gastos", "Resultado"],
            meses.map((m) => [C.nombrePeriodo(m.p), n(m.facturado), n(m.recaudado), n(m.otros), n(m.egresos), n(m.neto)]),
            { der: [1, 2, 3, 4, 5], pie: ["Total", n(t.facturado), n(t.recaudado), n(t.otros), n(t.egresos), n(t.neto)] })) +
          sec("Recaudo por servicio", barras(agrupar(d.cobros, (c) => c.descripcion, (c) => c.pagado).slice(0, 12), "#047857")) +
          sec("Gastos por categoría", barras(agrupar(d.movs.filter((m) => m.tipo === "egreso"), (m) => m.categoria, (m) => m.monto).slice(0, 12), "#b91c1c")) +
          sec("Pagos recibidos por método", barras(agrupar(d.aprobados, (p) => metodo(p.metodo), (p) => p.monto), "#1e40af")) +
          sec("Casas con mayor deuda", tabla(["Casa", "Propietario", "Teléfono", "Deuda", "Vencido"],
            morosos.map((c) => [c.codigo, c.propietario || "", c.telefono || "", n(c.deuda), n(c.vencido)]), { der: [3, 4] }),
            "Las 15 casas con el saldo más alto a la fecha de generación.") +
          sec("Portería", kpis([
            ["Visitas registradas", String(d.visitas.length), d.visitas.filter((v) => v.estado === "adentro" || v.estado === "salio").length + " ingresaron"],
            ["Paquetes recibidos", String(d.paquetes.length), d.paquetes.filter((p) => !p.entregado_at).length + " sin entregar"],
          ]));
      },
    },
    {
      id: "balance", titulo: "Balance financiero mensual", icono: "BF",
      desc: "Mes a mes: lo facturado, lo recaudado, otros ingresos, gastos y el saldo acumulado del periodo.",
      armar(d) {
        const meses = porMes(d); let acum = 0;
        const serie = meses.map((m) => ({ etq: C.mesCorto(m.p), a: m.recaudado + m.otros, b: m.egresos })); serie.ley = ["Entradas", "Gastos"];
        const t = totales(d);
        return kpis([
          ["Entradas", din(t.entradas), "cuotas + otros ingresos", "ok"], ["Gastos", din(t.egresos), "", "mal"],
          ["Resultado", din(t.neto), "", t.neto >= 0 ? "ok" : "mal"], ["Efectividad de recaudo", pct(t.abonado, t.facturado) + "%", "pagado sobre facturado"],
        ]) + sec("Entradas vs. gastos", dobles(serie)) +
          sec("Detalle por mes", tabla(["Mes", "Facturado", "Abonado a cobros", "Cuotas recibidas", "Otros ingresos", "Gastos", "Resultado", "Acumulado"],
            meses.map((m) => { acum += m.neto; return [C.nombrePeriodo(m.p), n(m.facturado), n(m.abonado), n(m.recaudado), n(m.otros), n(m.egresos), n(m.neto), n(acum)]; }),
            { der: [1, 2, 3, 4, 5, 6, 7], pie: ["Total", n(t.facturado), n(t.abonado), n(t.recaudado), n(t.otros), n(t.egresos), n(t.neto), ""] }));
      },
    },
    {
      id: "cartera", titulo: "Cartera y morosos", icono: "CM",
      desc: "Todas las casas que deben, cuánto está vencido, cuántos meses llevan y desde cuándo. Para cobrar o pasar a cobro jurídico.",
      armar(d) {
        const pend = pendientesPorCasa(d);
        const l = d.casas.filter((c) => c.activa && c.deuda > 0).sort((a, b) => b.deuda - a.deuda);
        const rangos = { "1 mes": 0, "2 a 3 meses": 0, "4 a 6 meses": 0, "Más de 6 meses": 0 };
        l.forEach((c) => { const k = (pend.get(c.id)?.meses.size) || 1; rangos[k <= 1 ? "1 mes" : k <= 3 ? "2 a 3 meses" : k <= 6 ? "4 a 6 meses" : "Más de 6 meses"] += c.deuda; });
        const t = totales(d);
        return kpis([
          ["Cartera total", din(t.cartera), l.length + " casas con saldo", "mal"], ["Vencido", din(t.vencida), t.morosas + " casas en mora", "mal"],
          ["Al día", t.alDia + " casas", pct(t.alDia, t.activas) + "%", "ok"],
        ]) + sec("Antigüedad de la deuda", barras(Object.entries(rangos).map(([etq, valor]) => ({ etq, valor })), "#b91c1c"), "Valor de deuda según cuántos meses tiene pendientes cada casa.") +
          sec("Detalle por casa", tabla(["Casa", "Propietario", "Teléfono", "Meses pend.", "Desde", "Vencido", "Deuda total"],
            l.map((c) => { const p = pend.get(c.id); return [c.codigo, c.propietario || "", c.telefono || "", String(p ? p.meses.size : "—"), p ? C.nombrePeriodo(p.viejo) : "—", n(c.vencido), n(c.deuda)]; }),
            { der: [5, 6], pie: ["Total", "", "", "", "", n(t.vencida), n(t.cartera)] }), "Saldos a la fecha de generación del reporte.");
      },
    },
    {
      id: "recaudo", titulo: "Pagos recibidos", icono: "PR",
      desc: "Cada pago aprobado en el rango con fecha, casa, método y referencia. Incluye los pendientes por validar y rechazados.",
      armar(d) {
        const ap = d.aprobados.slice().sort((a, b) => String(a.creado_at).localeCompare(String(b.creado_at)));
        const pv = d.pagos.filter((p) => p.estado === "por_validar"), rz = d.pagos.filter((p) => p.estado === "rechazado");
        const fila = (p) => [fechaHora(p.creado_at), casaTxt(d, p.casa_id), propTxt(d, p.casa_id), metodo(p.metodo), p.referencia || "", p.reportado_por === "admin" ? "Administración" : "Casa", n(p.monto)];
        const cab = ["Fecha", "Casa", "Propietario", "Método", "Referencia", "Registró", "Valor"];
        return kpis([
          ["Total recaudado", din(suma(ap, (p) => p.monto)), ap.length + " pagos aprobados", "ok"],
          ["Por validar", din(suma(pv, (p) => p.monto)), pv.length + " pagos", "warn"],
          ["Rechazados", String(rz.length), din(suma(rz, (p) => p.monto)), "mal"],
          ["Pago promedio", din(ap.length ? suma(ap, (p) => p.monto) / ap.length : 0), ""],
        ]) + sec("Por método de pago", barras(agrupar(ap, (p) => metodo(p.metodo), (p) => p.monto), "#1e40af")) +
          sec("Pagos aprobados", tabla(cab, ap.map(fila), { der: [6], pie: ["Total", "", "", "", "", "", n(suma(ap, (p) => p.monto))] })) +
          (pv.length ? sec("Pendientes por validar", tabla(cab, pv.map(fila), { der: [6] })) : "") +
          (rz.length ? sec("Rechazados", tabla(["Fecha", "Casa", "Valor", "Motivo"], rz.map((p) => [fechaHora(p.creado_at), casaTxt(d, p.casa_id), n(p.monto), p.motivo_rechazo || ""]), { der: [2] })) : "");
      },
    },
    {
      id: "servicios", titulo: "Cobros por servicio", icono: "CS",
      desc: "Cuánto se facturó y se recaudó de cada servicio (administración, agua, parqueadero…) y qué falta por cobrar.",
      armar(d) {
        const m = new Map();
        for (const c of d.cobros) {
          const x = m.get(c.descripcion) || { casas: new Set(), f: 0, p: 0 };
          x.casas.add(c.casa_id); x.f += Number(c.monto); x.p += Number(c.pagado); m.set(c.descripcion, x);
        }
        const l = [...m.entries()].sort((a, b) => b[1].f - a[1].f);
        const tf = suma(l, (x) => x[1].f), tp = suma(l, (x) => x[1].p);
        return kpis([["Facturado", din(tf), l.length + " servicios"], ["Recaudado", din(tp), pct(tp, tf) + "%", "ok"], ["Por cobrar", din(tf - tp), "", "mal"]]) +
          sec("Recaudo por servicio", barras(l.map(([etq, x]) => ({ etq, valor: x.f, texto: din(x.p) + " de " + din(x.f) })), "#047857")) +
          sec("Detalle", tabla(["Servicio", "Casas", "Facturado", "Recaudado", "Pendiente", "% recaudo"],
            l.map(([etq, x]) => [etq, String(x.casas.size), n(x.f), n(x.p), n(x.f - x.p), pct(x.p, x.f) + "%"]),
            { der: [2, 3, 4, 5], pie: ["Total", "", n(tf), n(tp), n(tf - tp), pct(tp, tf) + "%"] }));
      },
    },
    {
      id: "caja", titulo: "Libro de caja", icono: "LC",
      desc: "Ingresos y egresos en orden de fecha con saldo acumulado, gastos por categoría y por proveedor.",
      armar(d) {
        const cuotas = new Map();
        d.aprobados.forEach((p) => { const f = diaTs(p.creado_at); cuotas.set(f, (cuotas.get(f) || 0) + Number(p.monto)); });
        const mov = [
          ...[...cuotas.entries()].map(([fecha, monto]) => ({ fecha, tipo: "ingreso", categoria: "Cuotas", concepto: "Pagos de casas del día", proveedor: "", monto })),
          ...d.movs,
        ].sort((a, b) => a.fecha.localeCompare(b.fecha));
        let saldo = 0;
        const t = totales(d);
        const egr = d.movs.filter((m) => m.tipo === "egreso");
        return kpis([["Entradas", din(t.entradas), "", "ok"], ["Salidas", din(t.egresos), "", "mal"], ["Saldo del periodo", din(t.neto), "", t.neto >= 0 ? "ok" : "mal"]]) +
          sec("Movimientos", tabla(["Fecha", "Categoría", "Concepto", "Tercero", "Entrada", "Salida", "Saldo"],
            mov.map((m) => { saldo += m.tipo === "ingreso" ? Number(m.monto) : -Number(m.monto); return [C.fecha(m.fecha), m.categoria, m.concepto, m.proveedor || "", m.tipo === "ingreso" ? n(m.monto) : "<td></td>", m.tipo === "egreso" ? n(m.monto) : "<td></td>", n(saldo)]; }),
            { der: [4, 5, 6], pie: ["Total", "", "", "", n(t.entradas), n(t.egresos), n(t.neto)] }), "Los pagos de las casas se agrupan por día para que el libro sea legible.") +
          sec("Gastos por categoría", barras(agrupar(egr, (m) => m.categoria, (m) => m.monto), "#b91c1c")) +
          sec("Gastos por proveedor", tabla(["Proveedor", "Valor"], agrupar(egr, (m) => m.proveedor || "Sin proveedor", (m) => m.monto).map((x) => [x.etq, n(x.valor)]), { der: [1] }));
      },
    },
    {
      id: "pazysalvo", titulo: "Casas al día (paz y salvo)", icono: "PS",
      desc: "Listado de las casas que no deben nada a la fecha, para publicar en cartelera o enviar al consejo.",
      armar(d) {
        const l = d.casas.filter((c) => c.activa && c.deuda <= 0).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
        const t = totales(d);
        return kpis([["Casas al día", l.length + " de " + t.activas, pct(l.length, t.activas) + "%", "ok"], ["Casas con saldo", String(t.activas - l.length), din(t.cartera), "mal"]]) +
          sec("Listado", tabla(["#", "Casa", "Propietario", "Saldo a favor"], l.map((c, i) => [String(i + 1), c.codigo, c.propietario || "", Number(c.saldo_favor) > 0 ? n(c.saldo_favor) : "<td class=\"n\">—</td>"]), { der: [3] }));
      },
    },
    {
      id: "cuenta", titulo: "Estado de cuenta de una casa", icono: "EC", casa: true,
      desc: "Cobros, abonos, pagos y saldo de la casa elegida. Para entregarle al propietario o resolver reclamos.",
      async armar(d, casa) {
        const r = await C.llamar("adm_estado_casa", { casa_id: casa.id });
        const pend = r.cobros.filter((c) => Number(c.pagado) < Number(c.monto));
        const enRango = r.cobros.filter((c) => d.pers.includes(c.periodo)).sort((a, b) => a.periodo.localeCompare(b.periodo));
        const pagos = r.pagos.filter((p) => { const f = diaTs(p.creado_at); return f >= d.r.desde && f <= d.r.hasta; }).sort((a, b) => String(a.creado_at).localeCompare(String(b.creado_at)));
        const estado = (c) => (Number(c.pagado) >= Number(c.monto) ? "Pagado" : Number(c.pagado) > 0 ? "Abonado" : c.vence && c.vence < hoy ? "Vencido" : "Pendiente");
        const deuda = suma(pend, (c) => Number(c.monto) - Number(c.pagado));
        return '<div class="ficha"><div><span>Casa</span><b>' + esc(casa.codigo) + "</b></div><div><span>Propietario</span><b>" + esc(casa.propietario || "—") + "</b></div><div><span>Teléfono</span><b>" + esc(casa.telefono || "—") + "</b></div><div><span>Coeficiente</span><b>" + esc(String(casa.coeficiente || 0)) + "</b></div></div>" +
          kpis([["Saldo pendiente", din(deuda), pend.length + " cobros sin pagar completo", deuda > 0 ? "mal" : "ok"], ["Saldo a favor", din(r.casa.saldo_favor || 0), "", "ok"],
            ["Facturado en el rango", din(suma(enRango, (c) => c.monto)), ""], ["Pagado en el rango", din(suma(pagos.filter((p) => p.estado === "aprobado"), (p) => p.monto)), "", "ok"]]) +
          sec("Cobros del periodo", tabla(["Mes", "Servicio", "Vence", "Valor", "Pagado", "Pendiente", "Estado"],
            enRango.map((c) => [C.nombrePeriodo(c.periodo), c.descripcion, C.fecha(c.vence), n(c.monto), n(c.pagado), n(Number(c.monto) - Number(c.pagado)), estado(c)]), { der: [3, 4, 5] })) +
          sec("Pagos del periodo", tabla(["Fecha", "Método", "Referencia", "Estado", "Valor"],
            pagos.map((p) => [fechaHora(p.creado_at), metodo(p.metodo), p.referencia || "", p.estado === "aprobado" ? "Aprobado" : p.estado === "rechazado" ? "Rechazado" : "Por validar", n(p.monto)]), { der: [4] })) +
          (pend.length ? sec("Todo lo que debe a la fecha", tabla(["Mes", "Servicio", "Vence", "Pendiente"],
            pend.sort((a, b) => a.periodo.localeCompare(b.periodo)).map((c) => [C.nombrePeriodo(c.periodo), c.descripcion, C.fecha(c.vence), n(Number(c.monto) - Number(c.pagado))]),
            { der: [3], pie: ["Total", "", "", n(deuda)] })) : "");
      },
    },
    {
      id: "certificado", titulo: "Certificado de paz y salvo", icono: "CP", casa: true, sinRango: true,
      desc: "Documento formal con firma para la casa elegida. Solo se genera si la casa no tiene deuda.",
      async armar(d, casa) {
        const r = await C.llamar("adm_estado_casa", { casa_id: casa.id });
        const deuda = suma(r.cobros, (c) => Math.max(0, Number(c.monto) - Number(c.pagado)));
        if (deuda > 0) throw new Error("La casa " + casa.codigo + " tiene un saldo pendiente de " + din(deuda) + ". No se puede expedir paz y salvo.");
        const cj = d.conj;
        return '<div class="certificado"><p class="lugar">' + esc((cj.ciudad ? cj.ciudad + ", " : "") + C.fecha(hoy)) + "</p>" +
          "<h2>Certificado de paz y salvo</h2>" +
          "<p>La administración de <b>" + esc(cj.nombre) + "</b>" + (cj.nit ? " (NIT " + esc(cj.nit) + ")" : "") + " certifica que la unidad <b>" + esc(casa.codigo) + "</b>" +
          (casa.propietario ? ", cuyo propietario o responsable es <b>" + esc(casa.propietario) + "</b>," : "") +
          " se encuentra <b>a paz y salvo</b> por concepto de cuotas de administración y demás obligaciones económicas con la copropiedad a la fecha de expedición de este documento.</p>" +
          "<p>Se expide a solicitud del interesado. Este certificado es válido por treinta (30) días calendario.</p>" +
          '<div class="firmas"><div><i></i><b>Administración</b><span>' + esc(cj.nombre) + "</span></div><div><i></i><b>Recibido</b><span>Propietario / residente</span></div></div></div>";
      },
    },
    {
      id: "porteria", titulo: "Portería: visitas y paquetes", icono: "PV",
      desc: "Quién entró, a qué casa, en qué vehículo y cuándo salió. Paquetes recibidos y entregados. Útil ante cualquier incidente.",
      armar(d) {
        const v = d.visitas.slice().sort((a, b) => String(a.creado_at).localeCompare(String(b.creado_at)));
        const p = d.paquetes.slice().sort((a, b) => String(a.recibido_at).localeCompare(String(b.recibido_at)));
        const sinEntregar = p.filter((x) => !x.entregado_at);
        return kpis([["Visitas", String(v.length), v.filter((x) => x.ingreso_at).length + " ingresaron"], ["Rechazadas", String(v.filter((x) => x.estado === "rechazado").length), "", "mal"],
          ["Paquetes", String(p.length), sinEntregar.length + " sin entregar", sinEntregar.length ? "warn" : "ok"]]) +
          '<div class="dos">' + sec("Visitas por tipo", barras(agrupar(v, (x) => C.TIPOS_VISITA[x.tipo] || x.tipo, () => 1).map((x) => ({ ...x, texto: String(x.valor) })), "#1e40af")) +
          sec("Casas con más visitas", barras(agrupar(v, (x) => casaTxt(d, x.casa_id), () => 1).slice(0, 10).map((x) => ({ ...x, texto: String(x.valor) })), "#6d28d9")) + "</div>" +
          sec("Registro de visitas", tabla(["Fecha", "Casa", "Visitante", "Documento", "Placa", "Tipo", "Estado", "Ingreso", "Salida"],
            v.map((x) => [C.fecha(x.fecha), casaTxt(d, x.casa_id), x.nombre, x.documento || "", x.placa || "", C.TIPOS_VISITA[x.tipo] || x.tipo, ESTV[x.estado] || x.estado, x.ingreso_at ? fechaHora(x.ingreso_at) : "—", x.salida_at ? fechaHora(x.salida_at) : "—"]))) +
          sec("Paquetes", tabla(["Recibido", "Casa", "Descripción", "Empresa", "Entregado", "Entregado a"],
            p.map((x) => [fechaHora(x.recibido_at), casaTxt(d, x.casa_id), x.descripcion, x.empresa || "", x.entregado_at ? fechaHora(x.entregado_at) : "Pendiente", x.entregado_a || ""])));
      },
    },
    {
      id: "directorio", titulo: "Directorio de casas", icono: "DC", sinRango: true,
      desc: "Todas las casas con propietario, teléfono, correo, coeficiente y usuario de acceso. Para tener a mano o actualizar datos.",
      armar(d) {
        const l = d.casas.slice().sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
        return kpis([["Casas", String(l.length), l.filter((c) => c.activa).length + " activas"], ["Con usuario", String(l.filter((c) => (c.usuarios || []).length).length), ""],
          ["Suma de coeficientes", String(Math.round(suma(l, (c) => c.coeficiente) * 1000) / 1000), ""]]) +
          sec("Listado", tabla(["Casa", "Propietario", "Teléfono", "Correo", "Coef.", "Usuario", "Estado"],
            l.map((c) => [c.codigo, c.propietario || "", c.telefono || "", c.correo || "", String(c.coeficiente || 0), ((c.usuarios || [])[0] || {}).usuario || "—", c.activa ? "Activa" : "Inactiva"])));
      },
    },
  ];

  // ------------------------------------------------------------------ tarjetas
  $("#rp-lista").innerHTML = REPORTES.map((r) =>
    '<article class="rp-card' + (r.destacado ? " destacado" : "") + '"><div class="rp-ico" aria-hidden="true">' + r.icono + "</div><div class=\"rp-txt\"><h3>" + esc(r.titulo) + "</h3><p>" + esc(r.desc) + "</p>" +
    (r.casa ? '<span class="chip info">Requiere elegir casa</span>' : r.sinRango ? '<span class="chip">Fecha de hoy</span>' : "") +
    '</div><button class="btn ' + (r.destacado ? "primario" : "") + '" type="button" data-rep="' + r.id + '">Descargar PDF</button></article>').join("");

  $("#rp-lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rep]"); if (!b) return;
    const rep = REPORTES.find((x) => x.id === b.dataset.rep);
    let r;
    try { r = rango(); } catch (er) { return C.aviso(er.message, "error"); }
    let casa = null;
    if (rep.casa) {
      if (!casaEl.value) { casaEl.focus(); return C.aviso("Elige la casa en el selector de arriba", "error"); }
    }
    // Abrimos la ventana dentro del clic para que el navegador no la bloquee.
    const ventana = window.open("", "_blank");
    if (ventana) ventana.document.write("<p style=\"font:16px system-ui;padding:24px\">Preparando el reporte…</p>");
    const listo = await C.accion(b, async () => {
      const d = await datos(r);
      d.r = r;
      if (rep.casa) casa = d.porId.get(casaEl.value) || null;
      if (rep.casa && !casa) throw new Error("No se encontró la casa elegida");
      const cuerpo = await rep.armar(d, casa);
      imprimir(ventana, rep, r, d.conj, casa, cuerpo);
      return true;
    });
    if (!listo && ventana && !ventana.closed) ventana.close();
  });

  // ------------------------------------------------------------------ documento imprimible
  const CSS = `
  @page{size:A4;margin:14mm 12mm}
  *{box-sizing:border-box}
  body{margin:0;font:11.5px/1.45 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:#0f172a;background:#eef2f7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .hoja{max-width:900px;margin:0 auto;background:#fff;padding:28px 32px}
  .barra{position:sticky;top:0;display:flex;gap:10px;justify-content:center;align-items:center;padding:12px;background:#0f1b3d;color:#e2e8f0;font-size:14px}
  .barra button{font:600 14px system-ui;border:0;border-radius:10px;padding:10px 18px;background:#38bdf8;color:#0b1220;cursor:pointer}
  .barra button.sec{background:transparent;color:#e2e8f0;border:1px solid #475569}
  header.enc{display:flex;justify-content:space-between;gap:16px;padding-bottom:14px;border-bottom:3px solid #1e3a8a;margin-bottom:16px}
  .enc h1{margin:0;font-size:20px;color:#1e3a8a}
  .enc .conj{font-weight:700;font-size:13px}
  .enc .meta{text-align:right;color:#475569;font-size:11px}
  .enc .rango{display:inline-block;margin-top:4px;padding:3px 10px;border-radius:999px;background:#e0e7ff;color:#1e3a8a;font-weight:600}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 14px}
  .kpi{border:1px solid #e2e8f0;border-left:4px solid #1e40af;border-radius:8px;padding:8px 10px;break-inside:avoid}
  .kpi.ok{border-left-color:#047857}.kpi.mal{border-left-color:#b91c1c}.kpi.warn{border-left-color:#b45309}
  .kpi span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  .kpi b{display:block;font-size:15px;margin-top:2px}
  .kpi small{color:#64748b;font-size:10px}
  .sec{margin:16px 0;break-inside:auto}
  .sec h2{font-size:13.5px;margin:0 0 6px;color:#1e3a8a;padding-bottom:4px;border-bottom:1px solid #e2e8f0}
  .nota{margin:0 0 6px;color:#64748b;font-size:10.5px}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  thead{display:table-header-group}
  th{background:#1e3a8a;color:#fff;text-align:left;padding:6px 7px;font-weight:600}
  td{padding:5px 7px;border-bottom:1px solid #e9eef5;vertical-align:top}
  tbody tr:nth-child(even) td{background:#f6f8fc}
  tr{break-inside:avoid}
  tfoot td{font-weight:700;background:#eef2ff;border-top:2px solid #1e3a8a}
  .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .vacio{text-align:center;color:#94a3b8;padding:12px}
  .barras{display:grid;gap:5px}
  .fila-b{display:grid;grid-template-columns:150px 1fr 120px;gap:8px;align-items:center}
  .fila-b .et{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pista{height:12px;background:#eef2f7;border-radius:6px;overflow:hidden}.pista i{display:block;height:100%;border-radius:6px}
  .fila-b .vl{text-align:right;font-variant-numeric:tabular-nums;color:#334155}
  .cols{display:flex;align-items:flex-end;gap:6px;height:150px;padding:6px 0;border-bottom:1px solid #cbd5e1}
  .col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%}
  .par{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:3px}
  .par i{width:38%;max-width:18px;border-radius:3px 3px 0 0;min-height:1px}
  .a{background:#1e40af}.b{background:#10b981}
  .col span{font-size:9.5px;color:#64748b}
  .ley{font-size:10px;color:#475569;margin:6px 0 0}.ley i{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 10px;vertical-align:middle}
  .dos{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .ficha{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;padding:10px;border-radius:8px;background:#f1f5ff}
  .ficha span{display:block;font-size:10px;color:#64748b;text-transform:uppercase}.ficha b{font-size:13px}
  .certificado{padding:30px 10px;font-size:13.5px;line-height:1.8}
  .certificado h2{text-align:center;font-size:20px;color:#1e3a8a;letter-spacing:.06em;text-transform:uppercase;margin:28px 0}
  .certificado .lugar{text-align:right;color:#475569}
  .firmas{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:90px;text-align:center}
  .firmas i{display:block;border-top:1px solid #0f172a;margin-bottom:6px}.firmas b{display:block}.firmas span{color:#64748b;font-size:11px}
  footer.pie{margin-top:22px;padding-top:8px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:9.5px;display:flex;justify-content:space-between}
  @media print{body{background:#fff}.barra{display:none}.hoja{padding:0;max-width:none}}
  @media (max-width:640px){.hoja{padding:16px}.kpis,.ficha{grid-template-columns:1fr 1fr}.dos{grid-template-columns:1fr}.fila-b{grid-template-columns:90px 1fr 80px}header.enc{flex-direction:column}.enc .meta{text-align:left}}
  `;

  function imprimir(ventana, rep, r, cj, casa, cuerpo) {
    const rangoTxt = rep.sinRango ? "Corte a " + C.fecha(hoy) : C.fecha(r.desde) + " — " + C.fecha(r.hasta);
    const titulo = [rep.titulo, casa ? casa.codigo : "", cj.nombre, rep.sinRango ? hoy : r.desde + " a " + r.hasta].filter(Boolean).join(" - ");
    const datosConj = [cj.nit ? "NIT " + cj.nit : "", cj.direccion, cj.ciudad, cj.telefono ? "Tel. " + cj.telefono : ""].filter(Boolean).join(" · ");
    const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(titulo) + "</title><style>" + CSS + "</style></head><body>" +
      '<div class="barra"><span>Para guardar: en la ventana de impresión elige <b>"Guardar como PDF"</b>.</span><button onclick="print()">Guardar PDF / Imprimir</button><button class="sec" onclick="close()">Cerrar</button></div>' +
      '<div class="hoja"><header class="enc"><div><div class="conj">' + esc(cj.nombre) + "</div>" + (datosConj ? '<div style="color:#64748b;font-size:10.5px">' + esc(datosConj) + "</div>" : "") +
      "<h1>" + esc(rep.titulo) + (casa ? " · " + esc(casa.codigo) : "") + '</h1></div><div class="meta"><div class="rango">' + esc(rangoTxt) + "</div><div>Generado: " + esc(fechaHora(new Date().toISOString())) + "</div></div></header>" +
      cuerpo + '<footer class="pie"><span>' + esc(cj.nombre) + " · Reporte generado desde el panel de administración</span><span>" + esc(rep.titulo) + "</span></footer></div>" +
      "<script>window.onload=function(){setTimeout(function(){try{print()}catch(e){}},350)}<\/script></body></html>";

    if (ventana && !ventana.closed) {
      ventana.document.open(); ventana.document.write(html); ventana.document.close(); ventana.focus();
      return;
    }
    // Si el navegador bloqueó la ventana nueva, imprimimos desde un marco oculto.
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html.replace(/<script>[\s\S]*?<\/script>/, "")); f.contentDocument.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 400);
  }
})();
