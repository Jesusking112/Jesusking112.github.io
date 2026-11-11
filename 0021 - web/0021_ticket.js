/* =============================================================================
   0021 · TICKET para impresora térmica (58 / 80 mm)
   Usa los datos que YA tiene la remisión: nombre del local, contacto,
   cantidad + producto + precio de cada renglón y el total.
   Formas de imprimir:
     · Diálogo de Windows (la más segura): ancho límite + "subir" ajustables,
       probado en impresora de tickets pequeña (50 mm de ancho, subir 0 mm).
     · Directa (USB / Bluetooth / cable serial) si el navegador la reconoce:
       en TEXTO (más compatible) o en IMAGEN (se ve igual a la vista previa).
       Si falla, se abre sola el diálogo de Windows.
   Todo lo que cambies en "Configurar" se guarda en este equipo
   (localStorage "inv0021_ticket"). Base de letras: window.TICKET_CONFIG.
   Requiere 0021_api.js antes.
   ============================================================================= */
(function () {
  "use strict";
  const I = window.Inv;
  const e = I.esc;
  const K_PREF = "inv0021_ticket";

  const BASE = {
    letraNombre: 20, letraContacto: 12, letraDatos: 11, letraProductos: 13, letraTotal: 18, letraPie: 11,
    fuente: "Arial, Helvetica, sans-serif", margenMm: 1, lineasFinal: 4, mensaje: "¡Gracias por su compra!",
    mostrarNumero: true, mostrarFecha: true, cortarPapel: true, baudios: 9600
  };
  const LETRAS = [["letraNombre", "Nombre del local"], ["letraContacto", "Teléfono"], ["letraDatos", "Nº y fecha"], ["letraProductos", "Productos"], ["letraTotal", "Total"], ["letraPie", "Mensaje final"]];

  // Configuración predeterminada probada en impresora de tickets pequeña por el diálogo de Windows.
  const PREDET = {
    ancho: 80, limite: 50, subir: 0, izquierda: 0,
    modo: "auto", envio: "texto", columnas: 48, copias: 1, cortar: true, auto: false,
    extra: "", mensaje: null, mostrarNumero: true, mostrarFecha: true, letras: {}
  };
  const pref = () => {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(K_PREF) || "{}") || {}; } catch (_e) { p = {}; }
    // v2: el "subir -60 mm" anterior cortaba el encabezado; se vuelve a 0 una sola vez.
    if (p.v !== 2) { if (p.subir === -60) p.subir = 0; p.v = 2; try { localStorage.setItem(K_PREF, JSON.stringify(p)); } catch (_e) { /* nada */ } }
    const r = Object.assign({}, PREDET, p);
    r.letras = Object.assign({}, p.letras || {});
    return r;
  };
  const guardarPref = (cambios) => localStorage.setItem(K_PREF, JSON.stringify(Object.assign(pref(), cambios)));
  const restaurar = () => { const ult = pref().ultima; localStorage.setItem(K_PREF, JSON.stringify({ ultima: ult, v: 2 })); };

  const cfg = () => {
    const p = pref();
    const c = Object.assign({}, BASE, window.TICKET_CONFIG || {}, p.letras);
    if (p.mensaje !== null && p.mensaje !== undefined) c.mensaje = p.mensaje;
    c.mostrarNumero = p.mostrarNumero; c.mostrarFecha = p.mostrarFecha;
    c.cortarPapel = p.cortar;
    return c;
  };

  function plata(n) { return "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function datos(neg, rem) {
    const items = (rem.items || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0)).map((it) => ({
      cant: I.cifra(it.cantidad) + " " + (I.UNIDADES[it.unidad] || it.unidad || ""),
      nombre: it.nombre || "",
      precio: plata(it.importe)
    }));
    return {
      nombre: neg.nombre || "",
      contacto: neg.celular || neg.telefono || "",
      extra: pref().extra || "",
      numero: rem.numero != null ? String(rem.numero).padStart(4, "0") : "",
      fecha: rem.fecha ? I.fechaCorta(rem.fecha) : "",
      items,
      total: plata(rem.total),
      anulada: rem.estado === "anulada"
    };
  }

  /* ---------- Versión HTML (vista previa y diálogo de Windows) ---------- */
  function css(c, anchoMm) {
    return ".tk{width:" + anchoMm + "mm;min-width:" + anchoMm + "mm;padding:" + c.margenMm + "mm;background:#fff;color:#000;font-family:" + c.fuente + ";line-height:1.2;box-sizing:border-box}" +
      ".tk *{box-sizing:border-box}" +
      ".tk .n{font-size:" + c.letraNombre + "px;font-weight:800;text-align:center;word-break:break-word}" +
      ".tk .ct{font-size:" + c.letraContacto + "px;text-align:center;margin-top:2px;word-break:break-word}" +
      ".tk .dt{font-size:" + c.letraDatos + "px;display:flex;justify-content:space-between;gap:6px;margin-top:4px}" +
      ".tk hr{border:0;border-top:1px dashed #000;margin:5px 0}" +
      ".tk .r{font-size:" + c.letraProductos + "px;padding:2px 0}" +
      ".tk .r .d{display:block;word-break:break-word}" +
      ".tk .r .l{display:flex;justify-content:space-between;gap:6px}.tk .r .q{white-space:nowrap;font-weight:700}.tk .r .p{white-space:nowrap;text-align:right;font-weight:700}" +
      ".tk .t{display:flex;justify-content:space-between;font-size:" + c.letraTotal + "px;font-weight:800}" +
      ".tk .an{text-align:center;font-weight:800;font-size:" + c.letraTotal + "px;border:2px solid #000;margin:4px 0;padding:2px}" +
      ".tk .pie{font-size:" + c.letraPie + "px;text-align:center;margin-top:5px}";
  }
  function html(d, c) {
    return '<div class="tk">' +
      '<div class="n">' + e(d.nombre) + "</div>" +
      (d.contacto ? '<div class="ct">Tel. ' + e(d.contacto) + "</div>" : "") +
      (d.extra ? '<div class="ct">' + e(d.extra) + "</div>" : "") +
      ((c.mostrarNumero && d.numero) || (c.mostrarFecha && d.fecha) ? '<div class="dt"><span>' + (c.mostrarNumero && d.numero ? "Nº " + e(d.numero) : "") + "</span><span>" + (c.mostrarFecha ? e(d.fecha) : "") + "</span></div>" : "") +
      (d.anulada ? '<div class="an">ANULADA</div>' : "") +
      "<hr>" +
      d.items.map((it) => '<div class="r"><span class="d">' + e(it.nombre) + '</span><span class="l"><span class="q">' + e(it.cant) + '</span><span class="p">' + e(it.precio) + "</span></span></div>").join("") +
      '<hr><div class="t"><span>TOTAL</span><span>' + e(d.total) + "</span></div>" +
      (c.mensaje ? '<div class="pie">' + e(c.mensaje) + "</div>" : "") +
      "</div>";
  }

  function imprimirNavegador(neg, rem) {
    const c = cfg(), p = pref();
    // El ticket va en el flujo normal (no "fixed": eso solo pinta la 1ª página y corta los tickets largos).
    // Subir / lados se hacen con márgenes, y el alto de la página se mide para que salga UN solo ticket continuo.
    const doc = '<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title><style id="pg">' +
      "@page{size:" + p.ancho + "mm auto;margin:0 !important}</style><style>" +
      "html,body{margin:0 !important;padding:0 !important;width:" + p.ancho + "mm !important;background:#fff !important}" +
      "*{-webkit-print-color-adjust:exact;print-color-adjust:exact}" + css(c, p.limite) +
      ".tk{margin:" + p.subir + "mm 0 0 " + p.izquierda + "mm !important}.tk .r,.tk .t{break-inside:avoid}" +
      "</style></head><body>" + html(datos(neg, rem), c) + "</body></html>";
    const marco = document.createElement("iframe");
    marco.setAttribute("aria-hidden", "true");
    marco.style.cssText = "position:fixed;right:0;bottom:0;width:" + p.ancho + "mm;height:10px;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(marco);
    const d = marco.contentDocument;
    d.open(); d.write(doc); d.close();
    setTimeout(() => {
      try {
        const tk = d.querySelector(".tk");
        const altoMm = Math.ceil(tk.getBoundingClientRect().height / 3.7795 + Number(p.subir) + 4);
        d.getElementById("pg").textContent = "@page{size:" + p.ancho + "mm " + Math.max(20, altoMm) + "mm;margin:0 !important}";
      } catch (_e) { /* se queda con alto automático */ }
      try { marco.contentWindow.focus(); marco.contentWindow.print(); } catch (_e) { I.aviso("No se pudo abrir la impresión", "error"); }
      setTimeout(() => marco.remove(), 60000);
    }, 250);
  }

  /* ---------- Directa en TEXTO (ESC/POS, la más compatible) ---------- */
  function limpio(v) {
    return String(v ?? "").replace(/º/g, "o").replace(/[¡¿]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
  }
  function partir(txt, ancho) {
    const out = []; let linea = "";
    limpio(txt).split(/\s+/).filter(Boolean).forEach((p) => {
      while (p.length > ancho) { if (linea) { out.push(linea); linea = ""; } out.push(p.slice(0, ancho)); p = p.slice(ancho); }
      if (!linea) linea = p; else if ((linea + " " + p).length <= ancho) linea += " " + p; else { out.push(linea); linea = p; }
    });
    if (linea) out.push(linea);
    return out.length ? out : [""];
  }
  function textoEscpos(neg, rem) {
    const c = cfg(), p = pref(), d = datos(neg, rem);
    const W = Math.max(24, Number(p.columnas) || 48), raya = "-".repeat(W);
    const ESC = "\x1B", GS = "\x1D", out = [];
    const L = (s) => out.push(limpio(s) + "\n");
    const dos = (izq, dch) => { izq = limpio(izq); dch = limpio(dch); const sp = Math.max(1, W - izq.length - dch.length); return izq + " ".repeat(sp) + dch; };
    out.push(ESC + "@", ESC + "a\x01", ESC + "E\x01", GS + "!\x01");
    partir(d.nombre, W).forEach(L);
    out.push(GS + "!\x00", ESC + "E\x00");
    if (d.contacto) partir("Tel. " + d.contacto, W).forEach(L);
    if (d.extra) partir(d.extra, W).forEach(L);
    out.push(ESC + "a\x00");
    if ((c.mostrarNumero && d.numero) || (c.mostrarFecha && d.fecha)) L(dos(c.mostrarNumero && d.numero ? "No " + d.numero : "", c.mostrarFecha ? d.fecha : ""));
    if (d.anulada) { out.push(ESC + "a\x01", ESC + "E\x01"); L("*** ANULADA ***"); out.push(ESC + "E\x00", ESC + "a\x00"); }
    L(raya);
    d.items.forEach((it) => {
      const precio = limpio(it.precio);
      const lineas = partir(limpio(it.cant).trim() + " " + it.nombre, Math.max(8, W - precio.length - 1));
      lineas.forEach((l, i) => L(i === 0 ? dos(l, precio) : l));
    });
    L(raya);
    out.push(ESC + "E\x01", GS + "!\x01"); L(dos("TOTAL", d.total)); out.push(GS + "!\x00", ESC + "E\x00");
    if (c.mensaje) { out.push(ESC + "a\x01"); L(""); partir(c.mensaje, W).forEach(L); out.push(ESC + "a\x00"); }
    out.push(ESC + "d" + String.fromCharCode(Math.max(0, Math.min(10, c.lineasFinal))));
    if (p.cortar) out.push(GS + "V\x42\x00");
    return new TextEncoder().encode(out.join(""));
  }

  /* ---------- Directa en IMAGEN (se ve igual a la vista previa) ---------- */
  function partirTexto(ctx, texto, max) {
    const palabras = String(texto).split(/\s+/).filter(Boolean), lineas = [];
    let actual = "";
    palabras.forEach((p) => {
      const prueba = actual ? actual + " " + p : p;
      if (ctx.measureText(prueba).width <= max || !actual) actual = prueba;
      else { lineas.push(actual); actual = p; }
      while (ctx.measureText(actual).width > max && actual.length > 1) {
        let i = actual.length - 1;
        while (i > 1 && ctx.measureText(actual.slice(0, i)).width > max) i--;
        lineas.push(actual.slice(0, i)); actual = actual.slice(i);
      }
    });
    if (actual) lineas.push(actual);
    return lineas.length ? lineas : [""];
  }
  function dibujar(neg, rem) {
    const c = cfg(), ancho = pref().ancho, d = datos(neg, rem);
    const W = ancho >= 80 ? 576 : 384;
    const k = W / (ancho * 3.7795);
    const m = Math.round(Math.max(2, c.margenMm) * 3.7795 * k);
    const util = W - m * 2;
    const f = (px, bold) => (bold ? "bold " : "") + Math.round(px * k) + "px " + c.fuente;
    const ops = [];
    const medir = document.createElement("canvas").getContext("2d");
    const linea = (txt, px, bold, alinear) => { medir.font = f(px, bold); partirTexto(medir, txt, util).forEach((l) => ops.push({ t: "txt", l, font: f(px, bold), h: Math.round(px * k * 1.3), a: alinear })); };
    const raya = () => ops.push({ t: "raya", h: Math.round(10 * k) });

    ops.push({ t: "esp", h: m });
    linea(d.nombre, c.letraNombre, true, "center");
    if (d.contacto) linea("Tel. " + d.contacto, c.letraContacto, false, "center");
    if (d.extra) linea(d.extra, c.letraContacto, false, "center");
    if ((c.mostrarNumero && d.numero) || (c.mostrarFecha && d.fecha)) ops.push({ t: "dos", i: c.mostrarNumero && d.numero ? "Nº " + d.numero : "", dch: c.mostrarFecha ? d.fecha : "", font: f(c.letraDatos), h: Math.round(c.letraDatos * k * 1.5) });
    if (d.anulada) linea("*** ANULADA ***", c.letraTotal, true, "center");
    raya();
    d.items.forEach((it) => {
      medir.font = f(c.letraProductos, true); const wq = medir.measureText(it.cant).width;
      medir.font = f(c.letraProductos); const wp = medir.measureText(it.precio).width;
      const gap = Math.round(6 * k);
      const lineas = partirTexto(medir, it.nombre, Math.max(40, util - wq - wp - gap * 2));
      ops.push({ t: "item", it, lineas, wq, gap, fB: f(c.letraProductos, true), fN: f(c.letraProductos), lh: Math.round(c.letraProductos * k * 1.3), h: Math.round(c.letraProductos * k * 1.3) * lineas.length + Math.round(4 * k) });
    });
    raya();
    ops.push({ t: "dos", i: "TOTAL", dch: d.total, font: f(c.letraTotal, true), h: Math.round(c.letraTotal * k * 1.4) });
    if (c.mensaje) { ops.push({ t: "esp", h: Math.round(6 * k) }); linea(c.mensaje, c.letraPie, false, "center"); }
    ops.push({ t: "esp", h: m });

    const H = ops.reduce((s, o) => s + o.h, 0);
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#000"; ctx.textBaseline = "top";
    let y = 0;
    ops.forEach((o) => {
      if (o.t === "txt") { ctx.font = o.font; ctx.textAlign = o.a === "center" ? "center" : "left"; ctx.fillText(o.l, o.a === "center" ? W / 2 : m, y); }
      else if (o.t === "raya") { ctx.fillRect(m, y + Math.floor(o.h / 2), util, Math.max(1, Math.round(k))); }
      else if (o.t === "dos") { ctx.font = o.font; ctx.textAlign = "left"; ctx.fillText(o.i, m, y); ctx.textAlign = "right"; ctx.fillText(o.dch, W - m, y); }
      else if (o.t === "item") {
        ctx.textAlign = "left"; ctx.font = o.fB; ctx.fillText(o.it.cant, m, y);
        ctx.font = o.fN; o.lineas.forEach((l, i) => ctx.fillText(l, m + o.wq + o.gap, y + i * o.lh));
        ctx.textAlign = "right"; ctx.fillText(o.it.precio, W - m, y);
      }
      y += o.h;
    });
    return cv;
  }
  // Imagen → ESC/POS (GS v 0) por franjas pequeñas para no llenar la memoria de impresoras baratas.
  function imagenEscpos(cv) {
    const c = cfg(), W = cv.width, H = cv.height;
    const px = cv.getContext("2d").getImageData(0, 0, W, H).data;
    const bpl = Math.ceil(W / 8), FRANJA = 128, out = [0x1b, 0x40, 0x1b, 0x61, 0x00];
    for (let y0 = 0; y0 < H; y0 += FRANJA) {
      const alto = Math.min(FRANJA, H - y0);
      out.push(0x1d, 0x76, 0x30, 0x00, bpl & 0xff, (bpl >> 8) & 0xff, alto & 0xff, (alto >> 8) & 0xff);
      for (let y = y0; y < y0 + alto; y++) {
        for (let x = 0; x < bpl; x++) {
          let b = 0;
          for (let bit = 0; bit < 8; bit++) {
            const xx = x * 8 + bit;
            if (xx < W) { const i = (y * W + xx) * 4; if ((px[i] + px[i + 1] + px[i + 2]) / 3 < 160) b |= 0x80 >> bit; }
          }
          out.push(b);
        }
      }
    }
    out.push(0x1b, 0x64, Math.max(0, Math.min(10, c.lineasFinal)));
    if (c.cortarPapel) out.push(0x1d, 0x56, 0x42, 0x00);
    return new Uint8Array(out);
  }
  const bytesDirectos = (neg, rem) => (pref().envio === "imagen" ? imagenEscpos(dibujar(neg, rem)) : textoEscpos(neg, rem));

  /* ---------- Conexión directa ---------- */
  let con = null;
  const ESPERA = (ms) => new Promise((r) => setTimeout(r, ms));
  const soporte = () => ({ usb: !!navigator.usb, bt: !!navigator.bluetooth, serial: !!navigator.serial });

  // Recorre interfaces Y alternativas hasta encontrar una salida "bulk" (método que funcionó en la prueba).
  async function prepararUSB(dev) {
    if (!dev.opened) await dev.open();
    if (!dev.configuration) await dev.selectConfiguration(1);
    const candidatos = [];
    dev.configuration.interfaces.forEach((iface) => iface.alternates.forEach((alt) => {
      const ep = alt.endpoints.find((x) => x.direction === "out" && x.type === "bulk") || alt.endpoints.find((x) => x.direction === "out");
      if (ep) candidatos.push({ iface: iface.interfaceNumber, alt: alt.alternateSetting, ep: ep.endpointNumber, impresora: alt.interfaceClass === 7, bulk: ep.type === "bulk" });
    }));
    candidatos.sort((a, b) => (b.impresora - a.impresora) || (b.bulk - a.bulk));
    if (!candidatos.length) throw new Error("Esa impresora USB no tiene salida de datos (Bulk OUT)");
    const s = candidatos[0];
    try { await dev.claimInterface(s.iface); } catch (_e) { /* ya estaba tomada */ }
    if (s.alt !== 0) { try { await dev.selectAlternateInterface(s.iface, s.alt); } catch (_e) { /* no hace falta */ } }
    return {
      tipo: "usb", nombre: dev.productName || dev.manufacturerName || "Impresora USB",
      detalle: "USB " + dev.vendorId.toString(16).padStart(4, "0").toUpperCase() + ":" + dev.productId.toString(16).padStart(4, "0").toUpperCase(),
      enviar: async (bytes) => {
        for (let i = 0; i < bytes.length; i += 4096) {
          const r = await dev.transferOut(s.ep, bytes.subarray(i, i + 4096));
          if (r.status !== "ok") throw new Error("La impresora no confirmó los datos");
        }
      },
      cerrar: async () => { try { await dev.releaseInterface(s.iface); } catch (_e) { /* nada */ } try { await dev.close(); } catch (_e) { /* nada */ } }
    };
  }
  async function prepararSerial(port) {
    if (!port.writable) await port.open({ baudRate: cfg().baudios });
    return {
      tipo: "serial", nombre: "Impresora por cable (serial)", detalle: cfg().baudios + " baudios",
      enviar: async (bytes) => {
        const w = port.writable.getWriter();
        try { for (let i = 0; i < bytes.length; i += 1024) await w.write(bytes.subarray(i, i + 1024)); }
        finally { w.releaseLock(); }
      },
      cerrar: async () => { try { await port.close(); } catch (_e) { /* nada */ } }
    };
  }
  async function prepararBT(dev) {
    const server = dev.gatt.connected ? dev.gatt : await dev.gatt.connect();
    let car = null;
    for (const s of await server.getPrimaryServices()) {
      for (const ch of await s.getCharacteristics()) { if (ch.properties.writeWithoutResponse || ch.properties.write) { car = ch; break; } }
      if (car) break;
    }
    if (!car) throw new Error("No se encontró por dónde mandarle datos a esa impresora Bluetooth");
    return {
      tipo: "bt", nombre: dev.name || "Impresora Bluetooth", detalle: "Bluetooth",
      enviar: async (bytes) => {
        if (!dev.gatt.connected) await dev.gatt.connect();
        for (let i = 0; i < bytes.length; i += 180) {
          const parte = bytes.slice(i, i + 180);
          if (car.properties.writeWithoutResponse) { await car.writeValueWithoutResponse(parte); await ESPERA(12); }
          else await car.writeValue(parte);
        }
      },
      cerrar: async () => { try { dev.gatt.disconnect(); } catch (_e) { /* nada */ } }
    };
  }

  async function conectar(tipo) {
    if (con) await desconectar();
    if (tipo === "usb") con = await prepararUSB(await navigator.usb.requestDevice({ filters: [] }));
    else if (tipo === "serial") con = await prepararSerial(await navigator.serial.requestPort());
    else if (tipo === "bt") con = await prepararBT(await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ["000018f0-0000-1000-8000-00805f9b34fb", "49535343-fe7d-4ae5-8fa9-9fafd205e455", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "0000ff00-0000-1000-8000-00805f9b34fb", "0000ffe0-0000-1000-8000-00805f9b34fb"] }));
    guardarPref({ ultima: tipo });
    return con;
  }
  async function desconectar() { if (con) await con.cerrar(); con = null; guardarPref({ ultima: null }); }

  // Reconecta sin preguntar la impresora USB / serial que ya se autorizó antes.
  async function reconectarCallado() {
    if (con) return con;
    const ult = pref().ultima;
    try {
      if (ult === "usb" && navigator.usb) { const l = await navigator.usb.getDevices(); if (l[0]) con = await prepararUSB(l[0]); }
      else if (ult === "serial" && navigator.serial) { const l = await navigator.serial.getPorts(); if (l[0]) con = await prepararSerial(l[0]); }
    } catch (_e) { con = null; }
    return con;
  }

  async function imprimir(neg, rem, forzarDialogo) {
    const p = pref();
    if (!forzarDialogo && p.modo !== "navegador") {
      const c = await reconectarCallado();
      if (c) {
        try {
          const bytes = bytesDirectos(neg, rem), n = Math.max(1, Math.min(5, Number(p.copias) || 1));
          for (let i = 0; i < n; i++) await c.enviar(bytes);
          I.aviso("Ticket enviado a " + c.nombre + (n > 1 ? " (" + n + " copias)" : ""), "ok");
          return;
        } catch (err) { con = null; I.aviso("La impresora no respondió (" + (err.message || err) + "). Se abre el diálogo de Windows.", "error"); }
      }
    }
    imprimirNavegador(neg, rem);
  }

  const PRUEBA = {
    numero: 1, fecha: new Date().toISOString().slice(0, 10), total: 220, estado: "pendiente",
    items: [{ orden: 1, cantidad: 2, unidad: "und", nombre: "Producto de prueba 1", importe: 100 }, { orden: 2, cantidad: 1, unidad: "und", nombre: "Producto de prueba con nombre largo", importe: 120 }]
  };

  /* ---------- Ventana del ticket ---------- */
  function rango(id, etq, min, max, ayuda) {
    return '<label class="tk-rango"><span class="tk-rango-h"><b>' + etq + '</b><output id="' + id + '-v"></output></span>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="1">' + (ayuda ? "<small>" + ayuda + "</small>" : "") + "</label>";
  }
  function panelConfig() {
    return '<div class="tk-cfg" id="tk-cfg" hidden>' +
      '<p class="tk-cfg-t">Impresión con el diálogo de Windows</p>' +
      '<fieldset class="tk-seg"><legend>Ancho del papel</legend>' +
        '<label><input type="radio" name="tk-ancho" value="58"><span>58 mm<small>chica</small></span></label>' +
        '<label><input type="radio" name="tk-ancho" value="80"><span>80 mm<small>grande</small></span></label></fieldset>' +
      rango("tk-limite", "Ancho del ticket", 30, 80, "Si se corta a los lados, bájalo. Predeterminado: 50 mm.") +
      rango("tk-subir", "Subir / bajar", -80, 30, "Si sale espacio en blanco arriba, muévelo a la izquierda (negativo). Si se corta el nombre del local, súbelo hacia 0. Predeterminado: 0 mm.") +
      rango("tk-izq", "Mover a los lados", -10, 20, "Si queda corrido, ajústalo. Predeterminado: 0 mm.") +
      '<p class="tk-cfg-t">Tamaño de letra (px)</p><div class="tk-letras">' +
        LETRAS.map(([k, n]) => '<label class="campo"><span>' + n + '</span><input type="number" min="6" max="40" data-letra="' + k + '"></label>').join("") + "</div>" +
      '<p class="tk-cfg-t">Datos del ticket</p>' +
      '<label class="campo"><span>Línea extra (RFC, dirección…)</span><input id="tk-extra" maxlength="80" placeholder="RFC: ABC123456789"></label>' +
      '<label class="campo"><span>Mensaje final</span><input id="tk-mensaje" maxlength="80"></label>' +
      '<label class="tk-chk"><input type="checkbox" id="tk-num"><span>Mostrar Nº de remisión</span></label>' +
      '<label class="tk-chk"><input type="checkbox" id="tk-fecha"><span>Mostrar fecha</span></label>' +
      '<p class="tk-cfg-t">Impresora directa (USB / Bluetooth)</p>' +
      '<fieldset class="tk-seg"><legend>Qué le mando</legend>' +
        '<label><input type="radio" name="tk-envio" value="texto"><span>Texto<small>más compatible</small></span></label>' +
        '<label><input type="radio" name="tk-envio" value="imagen"><span>Imagen<small>igual a la vista</small></span></label></fieldset>' +
      '<div class="tk-letras">' +
        '<label class="campo"><span>Letras por renglón</span><select id="tk-cols"><option value="48">48 · 80 mm normal</option><option value="42">42 · 80 mm compacta</option><option value="32">32 · 58 mm</option></select></label>' +
        '<label class="campo"><span>Copias</span><input type="number" id="tk-copias" min="1" max="5"></label></div>' +
      '<label class="tk-chk"><input type="checkbox" id="tk-cortar"><span>Cortar el papel al final</span></label>' +
      '<div class="fila-btns" style="justify-content:flex-start"><button class="btn mini" type="button" id="tk-prueba">Imprimir prueba</button><button class="btn mini ghost" type="button" id="tk-reset">Restaurar predeterminada</button></div>' +
      "</div>";
  }

  function abrir(neg, rem) {
    const sp = soporte(), algo = sp.usb || sp.bt || sp.serial;
    I.modal('<h3>Ticket · Nº ' + e(String(rem.numero).padStart(4, "0")) + "</h3>" +
      '<div class="tk-grid">' +
        '<div class="tk-zona"><div class="tk-papel" id="tk-papel"></div></div>' +
        '<div class="pila tk-ctrl">' +
          '<div class="tk-estado" id="tk-estado"></div>' +
          '<fieldset class="tk-seg"><legend>Cómo imprimir</legend>' +
            '<label><input type="radio" name="tk-modo" value="auto"><span>Automático<small>directa si está conectada</small></span></label>' +
            '<label><input type="radio" name="tk-modo" value="navegador"><span>Diálogo de Windows<small>impresora instalada</small></span></label></fieldset>' +
          (algo
            ? '<div class="tk-con"><span class="muted">Conectar impresora directa:</span><div class="fila-btns" style="justify-content:flex-start">' +
                (sp.usb ? '<button class="btn mini" type="button" data-c="usb">USB</button>' : "") +
                (sp.bt ? '<button class="btn mini" type="button" data-c="bt">Bluetooth</button>' : "") +
                (sp.serial ? '<button class="btn mini" type="button" data-c="serial">Cable serial</button>' : "") +
                '<button class="btn mini ghost" type="button" data-c="quitar" id="tk-quitar">Desconectar</button></div></div>'
            : '<p class="muted tk-nota">Este navegador no permite conexión directa. Se usa el diálogo de Windows (elige tu impresora de tickets ahí). Para conexión directa usa Chrome o Edge.</p>') +
          '<label class="tk-chk"><input type="checkbox" id="tk-auto"><span>Imprimir el ticket solo al terminar cada venta</span></label>' +
          '<button class="btn primario tk-go" type="button" id="tk-go">Imprimir ticket</button>' +
          '<div class="fila-btns tk-sec"><button class="btn" type="button" id="tk-dialogo">Usar el diálogo de Windows</button><button class="btn" type="button" id="tk-config" aria-expanded="false" aria-controls="tk-cfg">Configurar</button></div>' +
          panelConfig() +
        "</div>" +
      "</div>", (m) => {
      const $m = (s) => m.querySelector(s);
      const cargar = () => {
        const p = pref(), c = cfg();
        $m('[name="tk-ancho"][value="' + (p.ancho >= 80 ? 80 : 58) + '"]').checked = true;
        $m('[name="tk-modo"][value="' + (p.modo === "navegador" ? "navegador" : "auto") + '"]').checked = true;
        $m('[name="tk-envio"][value="' + (p.envio === "imagen" ? "imagen" : "texto") + '"]').checked = true;
        $m("#tk-auto").checked = !!p.auto;
        $m("#tk-limite").value = p.limite; $m("#tk-subir").value = p.subir; $m("#tk-izq").value = p.izquierda;
        m.querySelectorAll("[data-letra]").forEach((inp) => { inp.value = c[inp.dataset.letra]; });
        $m("#tk-extra").value = p.extra || ""; $m("#tk-mensaje").value = c.mensaje || "";
        $m("#tk-num").checked = !!p.mostrarNumero; $m("#tk-fecha").checked = !!p.mostrarFecha;
        $m("#tk-cols").value = String(p.columnas); $m("#tk-copias").value = p.copias; $m("#tk-cortar").checked = !!p.cortar;
      };
      const pintar = () => {
        const c = cfg(), p = pref();
        $m("#tk-papel").innerHTML = "<style>" + css(c, p.limite) + "</style>" + html(datos(neg, rem), c);
        $m("#tk-limite-v").textContent = p.limite + " mm";
        $m("#tk-subir-v").textContent = p.subir + " mm";
        $m("#tk-izq-v").textContent = p.izquierda + " mm";
        const est = $m("#tk-estado");
        est.className = "tk-estado" + (con ? " ok" : "");
        est.textContent = con ? "Conectada: " + con.nombre + (con.detalle ? " · " + con.detalle : "") : (p.modo === "navegador" ? "Se usará el diálogo de Windows" : "Sin impresora directa · se usará el diálogo de Windows");
        const q = $m("#tk-quitar"); if (q) q.hidden = !con;
      };
      cargar();
      reconectarCallado().then(pintar);
      pintar();

      const guardarCampo = (t) => {
        if (t.name === "tk-ancho") { const a = Number(t.value), p = pref(); const cambios = { ancho: a }; if (a === 58 && Number(p.columnas) > 32) cambios.columnas = 32; if (a === 80 && Number(p.columnas) === 32) cambios.columnas = 48; if (a === 58 && p.limite > 58) cambios.limite = 48; guardarPref(cambios); cargar(); }
        else if (t.name === "tk-modo") guardarPref({ modo: t.value });
        else if (t.name === "tk-envio") guardarPref({ envio: t.value });
        else if (t.id === "tk-auto") guardarPref({ auto: t.checked });
        else if (t.id === "tk-limite") guardarPref({ limite: Number(t.value) });
        else if (t.id === "tk-subir") guardarPref({ subir: Number(t.value) });
        else if (t.id === "tk-izq") guardarPref({ izquierda: Number(t.value) });
        else if (t.dataset.letra) { const n = Number(t.value); if (n >= 6 && n <= 40) { const l = pref().letras; l[t.dataset.letra] = n; guardarPref({ letras: l }); } }
        else if (t.id === "tk-extra") guardarPref({ extra: t.value.trim() });
        else if (t.id === "tk-mensaje") guardarPref({ mensaje: t.value });
        else if (t.id === "tk-num") guardarPref({ mostrarNumero: t.checked });
        else if (t.id === "tk-fecha") guardarPref({ mostrarFecha: t.checked });
        else if (t.id === "tk-cols") guardarPref({ columnas: Number(t.value) });
        else if (t.id === "tk-copias") guardarPref({ copias: Math.max(1, Math.min(5, Number(t.value) || 1)) });
        else if (t.id === "tk-cortar") guardarPref({ cortar: t.checked });
        else return;
        pintar();
      };
      m.addEventListener("input", (ev) => guardarCampo(ev.target));
      m.addEventListener("change", (ev) => guardarCampo(ev.target));

      m.addEventListener("click", async (ev) => {
        const b = ev.target.closest("[data-c]");
        if (b) {
          if (b.dataset.c === "quitar") { await desconectar(); pintar(); return; }
          b.disabled = true;
          try { await conectar(b.dataset.c); I.aviso("Impresora conectada: " + con.nombre, "ok"); }
          catch (err) { if (err && err.name !== "NotFoundError") I.aviso("No se pudo conectar: " + (err.message || err) + ". Usa el diálogo de Windows.", "error"); }
          finally { b.disabled = false; }
          pintar(); return;
        }
        const go = ev.target.closest("#tk-go");
        if (go) { await I.accion(go, () => imprimir(neg, rem), null); pintar(); return; }
        if (ev.target.closest("#tk-dialogo")) { imprimirNavegador(neg, rem); return; }
        const cf = ev.target.closest("#tk-config");
        if (cf) { const panel = $m("#tk-cfg"); panel.hidden = !panel.hidden; cf.setAttribute("aria-expanded", String(!panel.hidden)); cf.classList.toggle("primario", !panel.hidden); if (!panel.hidden) panel.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
        const pr = ev.target.closest("#tk-prueba");
        if (pr) { await I.accion(pr, () => imprimir(neg, PRUEBA), null); pintar(); return; }
        if (ev.target.closest("#tk-reset")) {
          if (!confirm("¿Volver a la configuración predeterminada del ticket?")) return;
          restaurar(); cargar(); pintar(); I.aviso("Configuración predeterminada restaurada", "ok");
        }
      });
    }, true);
  }

  window.Ticket = { abrir, imprimir, autoAlVender: () => !!pref().auto };
})();
