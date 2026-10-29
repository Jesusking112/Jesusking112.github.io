/* =============================================================================
   0021 · TICKET para impresora térmica (58 / 80 mm)
   ============================================================================= */
(function () {
  "use strict";
  const I = window.Inv;
  const e = I.esc;
  const K_PREF = "inv0021_ticket";

  const BASE = {
    letraNombre: 20, letraContacto: 12, letraDatos: 11, letraProductos: 13, letraTotal: 18, letraPie: 11,
    fuente: "Arial, Helvetica, sans-serif", margenMm: 3, lineasFinal: 4, mensaje: "¡Gracias por su compra!",
    mostrarNumero: true, mostrarFecha: true, cortarPapel: true, baudios: 9600
  };
  const cfg = () => Object.assign({}, BASE, window.TICKET_CONFIG || {});
  const pref = () => { try { return Object.assign({ ancho: 58, modo: "auto", auto: false }, JSON.parse(localStorage.getItem(K_PREF) || "{}")); } catch (_e) { return { ancho: 58, modo: "auto", auto: false }; } };
  const guardarPref = (cambios) => localStorage.setItem(K_PREF, JSON.stringify(Object.assign(pref(), cambios)));

  function plata(n) { return "$" + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function datos(neg, rem) {
    const items = (rem.items || []).slice().sort((a, b) => a.orden - b.orden).map((it) => ({
      cant: I.cifra(it.cantidad) + " " + (I.UNIDADES[it.unidad] || it.unidad || ""),
      nombre: it.nombre || "",
      precio: plata(it.importe)
    }));
    return {
      nombre: neg.nombre || "",
      contacto: neg.celular || neg.telefono || "",
      numero: rem.numero != null ? String(rem.numero).padStart(4, "0") : "",
      fecha: rem.fecha ? I.fechaCorta(rem.fecha) : "",
      items,
      total: plata(rem.total),
      anulada: rem.estado === "anulada"
    };
  }

  function css(c, ancho) {
    return ".tk{width:" + ancho + "mm;padding:" + c.margenMm + "mm;background:#fff;color:#000;font-family:" + c.fuente + ";line-height:1.25;box-sizing:border-box}" +
      ".tk *{box-sizing:border-box}" +
      ".tk .n{font-size:" + c.letraNombre + "px;font-weight:800;text-align:center;word-break:break-word}" +
      ".tk .ct{font-size:" + c.letraContacto + "px;text-align:center;margin-top:2px}" +
      ".tk .dt{font-size:" + c.letraDatos + "px;display:flex;justify-content:space-between;gap:6px;margin-top:4px}" +
      ".tk hr{border:0;border-top:1px dashed #000;margin:6px 0}" +
      ".tk .r{display:flex;gap:6px;align-items:flex-start;font-size:" + c.letraProductos + "px;padding:2px 0}" +
      ".tk .r .q{white-space:nowrap;font-weight:700}.tk .r .d{flex:1;word-break:break-word}.tk .r .p{white-space:nowrap;text-align:right}" +
      ".tk .t{display:flex;justify-content:space-between;font-size:" + c.letraTotal + "px;font-weight:800}" +
      ".tk .an{text-align:center;font-weight:800;font-size:" + c.letraTotal + "px;border:2px solid #000;margin:4px 0;padding:2px}" +
      ".tk .pie{font-size:" + c.letraPie + "px;text-align:center;margin-top:6px}";
  }
  function html(d, c) {
    return '<div class="tk">' +
      '<div class="n">' + e(d.nombre) + "</div>" +
      (d.contacto ? '<div class="ct">Tel. ' + e(d.contacto) + "</div>" : "") +
      ((c.mostrarNumero && d.numero) || (c.mostrarFecha && d.fecha) ? '<div class="dt"><span>' + (c.mostrarNumero && d.numero ? "Nº " + e(d.numero) : "") + "</span><span>" + (c.mostrarFecha ? e(d.fecha) : "") + "</span></div>" : "") +
      (d.anulada ? '<div class="an">ANULADA</div>' : "") +
      "<hr>" +
      d.items.map((it) => '<div class="r"><span class="q">' + e(it.cant) + '</span><span class="d">' + e(it.nombre) + '</span><span class="p">' + e(it.precio) + "</span></div>").join("") +
      '<hr><div class="t"><span>TOTAL</span><span>' + e(d.total) + "</span></div>" +
      (c.mensaje ? '<div class="pie">' + e(c.mensaje) + "</div>" : "") +
      "</div>";
  }

  function imprimirNavegador(neg, rem) {
    const c = cfg(), ancho = pref().ancho;
    const doc = '<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title><style>@page{size:' + ancho + "mm auto;margin:0}html,body{margin:0;padding:0;background:#fff}" +
      "*{-webkit-print-color-adjust:exact;print-color-adjust:exact}" + css(c, ancho) + "</style></head><body>" + html(datos(neg, rem), c) + "</body></html>";
    const marco = document.createElement("iframe");
    marco.setAttribute("aria-hidden", "true");
    marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(marco);
    const d = marco.contentDocument;
    d.open(); d.write(doc); d.close();
    setTimeout(() => {
      try { marco.contentWindow.focus(); marco.contentWindow.print(); } catch (_e) { I.aviso("No se pudo abrir la impresión", "error"); }
      setTimeout(() => marco.remove(), 60000);
    }, 250);
  }

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
    const m = Math.round(c.margenMm * 3.7795 * k);
    const util = W - m * 2;
    const f = (px, bold) => (bold ? "bold " : "") + Math.round(px * k) + "px " + c.fuente;
    const ops = [];
    const medir = document.createElement("canvas").getContext("2d");

    const linea = (txt, px, bold, alinear) => { medir.font = f(px, bold); partirTexto(medir, txt, util).forEach((l) => ops.push({ t: "txt", l, font: f(px, bold), h: Math.round(px * k * 1.3), a: alinear })); };
    const raya = () => ops.push({ t: "raya", h: Math.round(10 * k) });

    ops.push({ t: "esp", h: m });
    linea(d.nombre, c.letraNombre, true, "center");
    if (d.contacto) linea("Tel. " + d.contacto, c.letraContacto, false, "center");
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

  function escpos(cv) {
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

  /* ---------- Conexión directa ---------- */
  let con = null;
  const ESPERA = (ms) => new Promise((r) => setTimeout(r, ms));
  const soporte = () => ({ usb: !!navigator.usb, bt: !!navigator.bluetooth, serial: !!navigator.serial });

  async function prepararUSB(dev) {
    if (!dev.opened) await dev.open();
    if (!dev.configuration) await dev.selectConfiguration(1);
    const ifaces = dev.configuration.interfaces;
    const buscar = (f) => ifaces.find((it) => f(it) && it.alternate.endpoints.some((ep) => ep.direction === "out"));
    const iface = buscar((it) => it.alternate.interfaceClass === 7) || buscar(() => true);
    if (!iface) throw new Error("Esa impresora USB no acepta datos");
    try { await dev.claimInterface(iface.interfaceNumber); } catch (_e) { /* ya estaba tomada */ }
    const ep = iface.alternate.endpoints.find((x) => x.direction === "out" && x.type === "bulk") || iface.alternate.endpoints.find((x) => x.direction === "out");
    return {
      tipo: "usb", nombre: dev.productName || "Impresora USB",
      enviar: async (bytes) => { for (let i = 0; i < bytes.length; i += 4096) await dev.transferOut(ep.endpointNumber, bytes.subarray(i, i + 4096)); },
      cerrar: async () => { try { await dev.close(); } catch (_e) { /* nada */ } }
    };
  }
  async function prepararSerial(port) {
    if (!port.writable) await port.open({ baudRate: cfg().baudios });
    return {
      tipo: "serial", nombre: "Impresora por cable (serial)",
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
      tipo: "bt", nombre: dev.name || "Impresora Bluetooth",
      enviar: async (bytes) => {
        if (!dev.gatt.connected) await dev.gatt.connect();
        for (let i = 0; i < bytes.length; i += 180) {
          const parte = bytes.slice(i, i + 180);
          if (car.properties.writeWithoutResponse) { await car.writeValueWithoutResponse(parte); await ESPERA(8); }
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

  async function reconectarCallado() {
    if (con) return con;
    const ult = pref().ultima;
    try {
      if (ult === "usb" && navigator.usb) { const l = await navigator.usb.getDevices(); if (l[0]) con = await prepararUSB(l[0]); }
      else if (ult === "serial" && navigator.serial) { const l = await navigator.serial.getPorts(); if (l[0]) con = await prepararSerial(l[0]); }
    } catch (_e) { con = null; }
    return con;
  }

  async function imprimir(neg, rem) {
    if (pref().modo !== "navegador") {
      const c = await reconectarCallado();
      if (c) {
        try { await c.enviar(escpos(dibujar(neg, rem))); I.aviso("Ticket enviado a " + c.nombre, "ok"); return; }
        catch (err) { con = null; I.aviso("La impresora no respondió (" + (err.message || err) + "). Se abre el diálogo de impresión.", "error"); }
      }
    }
    imprimirNavegador(neg, rem);
  }

  /* ---------- Ventana del ticket ---------- */
  function abrir(neg, rem) {
    const sp = soporte(), algo = sp.usb || sp.bt || sp.serial;
    I.modal('<h3>Ticket · Nº ' + e(String(rem.numero).padStart(4, "0")) + "</h3>" +
      '<div class="tk-grid">' +
        '<div class="tk-zona"><div class="tk-papel" id="tk-papel"></div></div>' +
        '<div class="pila tk-ctrl">' +
          '<div class="tk-estado" id="tk-estado"></div>' +
          '<fieldset class="tk-seg"><legend>Ancho del papel</legend>' +
            '<label><input type="radio" name="tk-ancho" value="58"><span>58 mm<small>chica</small></span></label>' +
            '<label><input type="radio" name="tk-ancho" value="80"><span>80 mm<small>grande</small></span></label></fieldset>' +
          '<fieldset class="tk-seg"><legend>Cómo imprimir</legend>' +
            '<label><input type="radio" name="tk-modo" value="auto"><span>Automático<small>directo si está conectada</small></span></label>' +
            '<label><input type="radio" name="tk-modo" value="navegador"><span>Diálogo<small>impresora instalada</small></span></label></fieldset>' +
          (algo
            ? '<div class="tk-con"><span class="muted">Conectar impresora directa:</span><div class="fila-btns" style="justify-content:flex-start">' +
                (sp.usb ? '<button class="btn mini" type="button" data-c="usb">USB</button>' : "") +
                (sp.bt ? '<button class="btn mini" type="button" data-c="bt">Bluetooth</button>' : "") +
                (sp.serial ? '<button class="btn mini" type="button" data-c="serial">Cable serial</button>' : "") +
                '<button class="btn mini ghost" type="button" data-c="quitar" id="tk-quitar">Desconectar</button></div></div>'
            : '<p class="muted tk-nota">Este navegador no permite conexión directa. Se usa el diálogo de impresión (elige tu impresora de tickets ahí). Para conexión directa usa Chrome o Edge.</p>') +
          '<label class="tk-chk"><input type="checkbox" id="tk-auto"><span>Imprimir el ticket solo al terminar cada venta</span></label>' +
          '<button class="btn primario tk-go" type="button" id="tk-go">Imprimir ticket</button>' +
        "</div>" +
      "</div>", (m) => {
      const p = pref();
      m.querySelector('[name="tk-ancho"][value="' + (p.ancho >= 80 ? 80 : 58) + '"]').checked = true;
      m.querySelector('[name="tk-modo"][value="' + (p.modo === "navegador" ? "navegador" : "auto") + '"]').checked = true;
      m.querySelector("#tk-auto").checked = !!p.auto;

      const pintar = () => {
        const c = cfg(), an = pref().ancho;
        m.querySelector("#tk-papel").innerHTML = "<style>" + css(c, an) + "</style>" + html(datos(neg, rem), c);
        const est = m.querySelector("#tk-estado");
        est.className = "tk-estado" + (con ? " ok" : "");
        est.textContent = con ? "Conectada: " + con.nombre : (pref().modo === "navegador" ? "Se usará el diálogo de impresión" : "Sin impresora directa · se usará el diálogo");
        const q = m.querySelector("#tk-quitar"); if (q) q.hidden = !con;
      };
      reconectarCallado().then(pintar);
      pintar();

      m.addEventListener("change", (ev) => {
        const t = ev.target;
        if (t.name === "tk-ancho") guardarPref({ ancho: Number(t.value) });
        else if (t.name === "tk-modo") guardarPref({ modo: t.value });
        else if (t.id === "tk-auto") guardarPref({ auto: t.checked });
        pintar();
      });
      m.addEventListener("click", async (ev) => {
        const b = ev.target.closest("[data-c]");
        if (b) {
          if (b.dataset.c === "quitar") { await desconectar(); pintar(); return; }
          b.disabled = true;
          try { await conectar(b.dataset.c); I.aviso("Impresora conectada: " + con.nombre, "ok"); }
          catch (err) { if (err && err.name !== "NotFoundError") I.aviso("No se pudo conectar: " + (err.message || err), "error"); }
          finally { b.disabled = false; }
          pintar(); return;
        }
        if (ev.target.closest("#tk-go")) { const g = ev.target.closest("#tk-go"); await I.accion(g, () => imprimir(neg, rem), null); pintar(); }
      });
    });
  }

  window.Ticket = { abrir, imprimir, autoAlVender: () => !!pref().auto };
})();
