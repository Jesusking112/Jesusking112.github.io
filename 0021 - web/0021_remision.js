/* =============================================================================
   0021 · Formato impreso de la REMISIÓN (igual al talonario de papel)
   Logo + datos del negocio, recuadro Nº/fecha, datos del cliente, tabla
   CANT / DESCRIPCIÓN / P. UNIT / IMPORTE, total, cantidad con letra y firmas.
   Se imprime con el diálogo del navegador: elegir "Guardar como PDF".
   Requiere 0021_api.js antes.
   ============================================================================= */
(function () {
  "use strict";
  const I = window.Inv;
  const e = I.esc;

  function plata(n) { return (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // Renglones que caben en carta: hoja con total y firmas vs. hoja de continuación.
  const POR_HOJA_FINAL = 16;
  const POR_HOJA_LLENA = 24;
  const MIN_RENGLONES = 14;

  function partirEnHojas(items) {
    const hojas = [];
    let resto = items;
    while (resto.length > POR_HOJA_FINAL) {
      const n = Math.min(POR_HOJA_LLENA, resto.length - 1);
      hojas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    hojas.push(resto);
    return hojas;
  }

  function sumar(lista) { return lista.reduce((s, it) => s + (Number(it.importe) || 0), 0); }

  function hojas(neg, rem) {
    const items = (rem.items || []).slice().sort((a, b) => a.orden - b.orden);
    const partes = partirEnHojas(items);
    let vienen = 0;
    return partes.map((parte, i) => {
      const html = hoja(neg, rem, parte, { n: i + 1, de: partes.length, vienen, van: vienen + sumar(parte) });
      vienen += sumar(parte);
      return html;
    }).join("");
  }

  function hoja(neg, rem, items, pag) {
    const color = neg.color || "#1f2937";
    const ultima = pag.n === pag.de;
    const varias = pag.de > 1;
    const vacios = ultima ? Math.max(0, (varias ? POR_HOJA_FINAL : MIN_RENGLONES) - items.length) : 0;
    const filaVienen = pag.n > 1 ? '<tr class="arrastre"><td></td><td>VIENEN de la hoja ' + (pag.n - 1) + '</td><td></td><td class="i">' + plata(pag.vienen) + "</td></tr>" : "";
    const filaVan = !ultima ? '<tr class="arrastre"><td></td><td>VAN · continúa en la hoja ' + (pag.n + 1) + '</td><td></td><td class="i">' + plata(pag.van) + "</td></tr>" : "";
    const logo = neg.logo ? '<img src="' + e(neg.logo) + '" alt="">' : '<div class="sin-logo">' + e(neg.nombre.slice(0, 2).toUpperCase()) + "</div>";
    const marcaAgua = neg.logo ? '<img class="agua" src="' + e(neg.logo) + '" alt="">' : "";
    const sello = rem.estado === "pagado" ? '<div class="sello ok">PAGADO</div>' : rem.estado === "anulada" ? '<div class="sello mal">ANULADA</div>' : "";
    const tel = [neg.telefono && "Tel " + neg.telefono, neg.celular && "Cel " + neg.celular].filter(Boolean);

    return '<section class="hoja" style="--c:' + e(color) + '">' + sello +
      '<header class="cab">' +
        '<div class="marca">' + (neg.razon ? '<small class="razon">' + e(neg.razon) + "</small>" : "") + '<div class="logo">' + logo + "</div>" +
          '<b class="nombre">' + e(neg.nombre) + "</b>" + (neg.lema ? '<small class="lema">' + e(neg.lema) + "</small>" : "") + "</div>" +
        '<div class="medio"><div class="datos">' + [neg.direccion, neg.ciudad].filter(Boolean).map((x) => "<div>" + e(x) + "</div>").join("") +
          tel.map((x) => "<div>" + e(x) + "</div>").join("") + (neg.documento ? "<div>" + e(neg.etiqueta_doc || "RFC / NIT") + ": " + e(neg.documento) + "</div>" : "") + "</div>" +
          (neg.logo2 ? '<img class="logo2" src="' + e(neg.logo2) + '" alt="">' : "") + "</div>" +
        '<div class="folio"><div class="t">REMISIÓN</div><div class="n"><span>Nº</span> ' + e(String(rem.numero).padStart(4, "0")) + '</div><div class="t">FECHA</div><div class="f">' + e(I.fechaCorta(rem.fecha)) + "</div>" +
          (varias ? '<div class="t">HOJA ' + pag.n + " DE " + pag.de + "</div>" : "") + "</div>" +
      "</header>" +
      '<div class="cliente">' +
        '<div class="l"><span>CLIENTE</span><b>' + e(rem.cliente_nombre) + "</b></div>" +
        '<div class="l"><span>DIRECCIÓN</span><b>' + e(rem.direccion || "") + "</b></div>" +
        '<div class="l doble"><div><span>CIUDAD</span><b>' + e(rem.ciudad || "") + '</b></div><div><span>' + e(neg.etiqueta_doc || "RFC / NIT") + "</span><b>" + e(rem.documento || "") + "</b></div></div>" +
      "</div>" +
      '<div class="tabla">' + marcaAgua +
        "<table><thead><tr><th class=\"c\">CANT.</th><th>DESCRIPCIÓN</th><th class=\"p\">P. UNIT.</th><th class=\"i\">IMPORTE</th></tr></thead><tbody>" + filaVienen +
        items.map((it) => "<tr><td class=\"c\">" + e(I.cifra(it.cantidad)) + " " + e(I.UNIDADES[it.unidad] || it.unidad) + "</td><td>" + e(it.nombre) +
          '</td><td class="p">' + plata(it.precio) + (it.precio_unidad && it.precio_unidad !== it.unidad ? "<small>/" + e(I.UNIDADES[it.precio_unidad] || it.precio_unidad) + "</small>" : "") + '</td><td class="i">' + plata(it.importe) + "</td></tr>").join("") +
        Array.from({ length: vacios }, () => "<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>").join("") +
        filaVan + "</tbody></table></div>" +
      (ultima ? pieFinal(neg, rem) : '<p class="sigue">Hoja ' + pag.n + " de " + pag.de + " · Remisión Nº " + e(String(rem.numero).padStart(4, "0")) + " · el total va en la última hoja</p>") +
      "</section>";
  }

  function pieFinal(neg, rem) {
    const abonado = Number(rem.pagado || 0);
    const saldoTxt = rem.estado === "parcial"
      ? '<div class="total abono"><span>ABONADO</span><b>$ ' + plata(abonado) + '</b></div><div class="total abono"><span>SALDO</span><b>$ ' + plata(Number(rem.total) - abonado) + "</b></div>"
      : "";
    return '<div class="total"><span>TOTAL</span><b>$ ' + plata(rem.total) + "</b></div>" + saldoTxt +
      '<div class="letra"><span>CANTIDAD CON LETRA</span><b>' + e(I.cantidadConLetra(rem.total, (neg.moneda || "pesos").toLowerCase())) + "</b></div>" +
      ((rem.metodo || rem.notas) ? '<div class="extra">' + (rem.metodo ? "<span>Forma de pago: <b>" + e(I.METODOS[rem.metodo] || rem.metodo) + "</b>" + (rem.referencia ? " · Ref. " + e(rem.referencia) : "") + "</span>" : "") +
        (rem.notas ? "<span>Notas: " + e(rem.notas) + "</span>" : "") + "</div>" : "") +
      '<div class="firmas"><div>RECIBIÓ NOMBRE</div><div>RECIBIÓ FIRMA</div></div>' +
      (neg.pie ? '<p class="pie">' + e(neg.pie) + "</p>" : "");
  }

  const CSS = `
    @page { size: letter; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 12px/1.35 Arial, Helvetica, sans-serif; color: #111; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .hoja { position: relative; width: 190mm; margin: 0 auto 8mm; padding: 6mm; border: 1px solid #ddd; border-radius: 10px; page-break-after: always; break-after: page; }
    .hoja:last-child { page-break-after: auto; break-after: auto; }
    @media print { .hoja { border: 0; padding: 0; margin: 0 auto; } }
    .cab { display: grid; grid-template-columns: 170px 1fr 190px; gap: 12px; align-items: center; }
    .marca { text-align: center; color: var(--c); }
    .marca .razon { display: block; font-size: 9.5px; letter-spacing: .14em; font-weight: 700; }
    .marca .logo { height: 72px; display: grid; place-items: center; }
    .marca .logo img { max-height: 72px; max-width: 160px; object-fit: contain; }
    .sin-logo { width: 64px; height: 64px; border-radius: 50%; border: 2px solid var(--c); display: grid; place-items: center; font: 800 22px Georgia, serif; }
    .marca .nombre { display: block; font: italic 700 15px Georgia, serif; margin-top: 2px; }
    .marca .lema { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; }
    .datos { font-size: 12.5px; color: #333; min-width: 0; overflow-wrap: anywhere; }
    .medio { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
    .logo2 { flex: none; max-height: 92px; max-width: 140px; object-fit: contain; }
    .folio { border: 1.5px solid var(--c); border-radius: 12px; overflow: hidden; text-align: center; }
    .folio .t { background: color-mix(in srgb, var(--c) 14%, #fff); color: var(--c); font-weight: 800; letter-spacing: .12em; font-size: 11px; padding: 3px; }
    .folio .n { font: 700 22px "Courier New", monospace; color: #b91c1c; padding: 6px 4px; }
    .folio .n span { font-size: 18px; }
    .folio .f { font: 700 16px "Courier New", monospace; padding: 6px; }
    .cliente { margin-top: 10px; border: 1.5px solid var(--c); border-radius: 12px; padding: 4px 12px; }
    .cliente .l { display: flex; gap: 10px; align-items: baseline; padding: 5px 0; border-bottom: 1px solid #e5e7eb; min-height: 26px; }
    .cliente .l:last-child { border-bottom: 0; }
    .cliente .doble { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
    .cliente .doble > div { display: flex; gap: 10px; align-items: baseline; }
    .cliente span { color: var(--c); font-size: 10.5px; font-weight: 700; min-width: 70px; }
    .cliente b { font-size: 13.5px; font-weight: 600; }
    .tabla { position: relative; margin-top: 10px; border: 1.5px solid var(--c); border-radius: 12px; overflow: hidden; }
    .tabla .agua { position: absolute; left: 50%; top: 55%; transform: translate(-50%, -50%); width: 55%; opacity: .07; pointer-events: none; }
    table { width: 100%; border-collapse: collapse; position: relative; }
    th { background: color-mix(in srgb, var(--c) 14%, #fff); color: var(--c); font-size: 10.5px; letter-spacing: .06em; padding: 5px 8px; text-align: center; border-bottom: 1.5px solid var(--c); }
    td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; height: 24px; font-size: 12.5px; }
    td + td, th + th { border-left: 1px solid color-mix(in srgb, var(--c) 45%, #fff); }
    .c { width: 15%; text-align: right; white-space: nowrap; }
    .p { width: 15%; text-align: right; white-space: nowrap; }
    .i { width: 17%; text-align: right; white-space: nowrap; font-weight: 700; }
    .total { margin: 8px 0 0 auto; width: 40%; display: flex; justify-content: space-between; align-items: center; border: 1.5px solid var(--c); border-radius: 10px; padding: 6px 12px; }
    .total span { color: var(--c); font-weight: 800; font-size: 11px; letter-spacing: .08em; }
    .total b { font-size: 18px; }
    .total.abono { margin-top: 4px; padding: 3px 12px; border-width: 1px; }
    .total.abono b { font-size: 14px; }
    .letra { margin-top: 8px; border: 1.5px solid var(--c); border-radius: 12px; padding: 6px 12px; min-height: 44px; }
    .letra span { display: block; color: var(--c); font-size: 10.5px; font-weight: 700; }
    .letra b { font-size: 12.5px; }
    .extra { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 11.5px; color: #374151; }
    .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 46px; }
    .firmas div { border-top: 1.5px solid #111; text-align: center; padding-top: 5px; font-weight: 800; font-size: 11px; }
    .pie { margin: 12px 0 0; text-align: center; font-size: 10.5px; color: #555; }
    .sello { position: absolute; right: 24mm; top: 70mm; transform: rotate(-14deg); border: 3px solid; border-radius: 10px; padding: 4px 14px; font: 900 26px Arial, sans-serif; letter-spacing: .1em; opacity: .55; z-index: 2; }
    .sello.ok { color: #15803d; } .sello.mal { color: #b91c1c; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    tr.arrastre td { background: color-mix(in srgb, var(--c) 8%, #fff); font-weight: 700; font-size: 11.5px; color: var(--c); }
    .sigue { margin: 10px 0 0; text-align: center; font-size: 11px; color: #555; font-style: italic; }
  `;

  function documento(neg, remisiones) {
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Remisión ' + e(remisiones.map((r) => r.numero).join(", ")) +
      "</title><style>" + CSS + "</style></head><body>" + remisiones.map((r) => hojas(neg, r)).join("") + "</body></html>";
  }

  // Imprime (o guarda como PDF) una o varias remisiones.
  function imprimir(neg, remisiones) {
    const lista = Array.isArray(remisiones) ? remisiones : [remisiones];
    const marco = document.createElement("iframe");
    marco.setAttribute("aria-hidden", "true");
    marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(marco);
    const doc = marco.contentDocument;
    doc.open(); doc.write(documento(neg, lista)); doc.close();
    const listo = () => {
      setTimeout(() => {
        try { marco.contentWindow.focus(); marco.contentWindow.print(); } catch (_e) { I.aviso("No se pudo abrir la impresión", "error"); }
        setTimeout(() => marco.remove(), 60000);
      }, 250);
    };
    const imgs = Array.from(doc.images);
    if (!imgs.length) listo();
    else Promise.all(imgs.map((im) => im.complete ? 1 : new Promise((r) => { im.onload = im.onerror = r; }))).then(listo);
  }

  // Vista previa dentro de la página (iframe visible).
  // La hoja siempre mide lo mismo (tamaño carta). En pantallas chicas se ENCOGE entera,
  // como una foto, en vez de reacomodarse y quedar corrida.
  const ANCHO_HOJA = 780;
  function vistaPrevia(contenedor, neg, rem) {
    if (contenedor._ajuste) contenedor._ajuste.disconnect();
    contenedor.innerHTML = '<div class="vista-rem"><div class="vista-escala"><iframe title="Vista previa de la remisión" scrolling="no"></iframe></div></div>';
    const caja = contenedor.querySelector(".vista-rem"), escala = caja.firstChild, f = escala.firstChild;
    f.style.width = ANCHO_HOJA + "px";
    const ajustar = () => {
      const d = f.contentDocument;
      if (!d || !d.body) return;
      f.style.height = "0px";
      const alto = Math.max(200, d.documentElement.scrollHeight);
      const k = Math.min(1, (caja.clientWidth || ANCHO_HOJA) / ANCHO_HOJA);
      f.style.height = alto + "px";
      f.style.transform = "scale(" + k + ")";
      escala.style.height = Math.ceil(alto * k) + "px";
    };
    f.onload = () => { ajustar(); Array.from(f.contentDocument.images).forEach((im) => { if (!im.complete) im.onload = ajustar; }); };
    f.srcdoc = documento(neg, [rem]);
    if (window.ResizeObserver) { contenedor._ajuste = new ResizeObserver(ajustar); contenedor._ajuste.observe(caja); }
  }

  function textoWhatsApp(neg, rem) {
    const MAX_LINEAS = 30;
    const todos = rem.items || [];
    const lineas = todos.slice(0, MAX_LINEAS).map((it) => "• " + I.cifra(it.cantidad) + " " + (I.UNIDADES[it.unidad] || it.unidad) + " " + it.nombre + " = " + I.dinero(it.importe));
    return "*" + neg.nombre + "*\nRemisión Nº " + rem.numero + " · " + I.fechaCorta(rem.fecha) + "\nCliente: " + rem.cliente_nombre + "\n\n" +
      lineas.join("\n") + (todos.length > MAX_LINEAS ? "\n… y " + (todos.length - MAX_LINEAS) + " productos más (ver el PDF completo)" : "") + "\n\n*TOTAL: " + I.dinero(rem.total) + "*\nEstado: " + (rem.estado === "pagado" ? "PAGADO" : rem.estado === "anulada" ? "ANULADA" : rem.estado === "parcial" ? "ABONADO " + I.dinero(rem.pagado) + " · *SALDO " + I.dinero(Number(rem.total) - Number(rem.pagado || 0)) + "*" : "PENDIENTE DE PAGO") +
      "\n\nAl pagar menciona el Nº de remisión " + rem.numero + ".";
  }

  window.Remision = { imprimir, vistaPrevia, documento, textoWhatsApp };
})();
