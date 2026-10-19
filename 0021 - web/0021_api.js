(function () {
  "use strict";

  const FUNCION_URL = "https://djbvgglroelnescxkjcw.supabase.co/functions/v1/inventario1";
  const SUPABASE_ANON_KEY = "sb_publishable_v0wAgT-Bbui1ytwpARw4lg_vnKOttEX";

  const K_TOKEN = "inv0021_token", K_ROL = "inv0021_rol", K_INFO = "inv0021_info";

  async function llamar(op, datos) {
    const cuerpo = Object.assign({}, datos || {}, { op, token: localStorage.getItem(K_TOKEN) || undefined });
    let res;
    try {
      res = await fetch(FUNCION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + SUPABASE_ANON_KEY, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify(cuerpo),
      });
    } catch (_e) {
      throw new Error("Sin conexión. Revisa tu internet.");
    }
    const json = await res.json().catch(() => ({ ok: false, error: "Respuesta inválida del servidor" }));
    if (!json.ok) {
      const msg = String(json.error || "Error");
      if (msg.startsWith("SESION:")) {
        const eraCreador = localStorage.getItem(K_ROL) === "creador";
        borrarSesion();
        sessionStorage.setItem("inv0021_motivo", msg.replace("SESION:", "").trim());
        const destino = eraCreador ? "0021_creador.html" : "0021_inicio.html";
        if (!location.pathname.endsWith(destino)) location.href = destino;
        throw new Error(msg.replace("SESION:", "").trim());
      }
      throw new Error(msg);
    }
    return json.data;
  }

  function guardarSesion(r) {
    localStorage.setItem(K_TOKEN, r.token);
    localStorage.setItem(K_ROL, r.rol);
    localStorage.setItem(K_INFO, JSON.stringify({ nombre: r.nombre, negocio: r.negocio }));
  }
  function borrarSesion() { [K_TOKEN, K_ROL, K_INFO].forEach((k) => localStorage.removeItem(k)); }
  function rol() { return localStorage.getItem(K_ROL); }
  function hayToken() { return !!localStorage.getItem(K_TOKEN); }
  function info() { try { return JSON.parse(localStorage.getItem(K_INFO) || "{}"); } catch (_e) { return {}; } }
  async function salir() {
    const eraCreador = rol() === "creador";
    try { await llamar("logout"); } catch (_e) { /* */ }
    borrarSesion();
    location.href = eraCreador ? "0021_creador.html" : "0021_inicio.html";
  }
  function exigir(roles) {
    if (!hayToken() || !roles.includes(rol())) { location.href = roles.includes("creador") ? "0021_creador.html" : "0021_inicio.html"; return null; }
    return info();
  }

  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function dinero(n) {
    const v = Number(n) || 0;
    return "$" + v.toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  }
  function cifra(n, dec) { return (Number(n) || 0).toLocaleString("es-MX", { maximumFractionDigits: dec ?? 3 }); }
  function numero(v) { const n = Number(String(v ?? "").replace(",", ".")); return v === "" || v == null || !Number.isFinite(n) ? null : n; }
  function fecha(iso, conHora) {
    if (!iso) return "—";
    const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
    const op = { day: "2-digit", month: "short", year: "numeric" };
    if (conHora) Object.assign(op, { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleString("es-MX", op);
  }
  function fechaCorta(iso) { if (!iso) return ""; const [a, m, d] = iso.slice(0, 10).split("-"); return d + "/" + m + "/" + a.slice(2); }
  function hoy() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function sumarDias(f, n) { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function inicioMes(f) { return (f || hoy()).slice(0, 8) + "01"; }
  function inicioSemana(f) { const d = new Date((f || hoy()) + "T12:00:00Z"); const w = (d.getUTCDay() + 6) % 7; return sumarDias(f || hoy(), -w); }

  const UNIDADES = { mg: "mg", g: "g", kg: "kg", lb: "lb", oz: "oz", ml: "ml", l: "L", gal: "gal", und: "und", doc: "doc" };
  const NOMBRE_UNIDAD = {
    mg: "Miligramos (mg)", g: "Gramos (g)", kg: "Kilogramos (kg)", lb: "Libras (lb)", oz: "Onzas (oz)",
    ml: "Mililitros (ml)", l: "Litros (L)", gal: "Galones (gal)", und: "Unidades / piezas", doc: "Docenas (12 und)",
  };

  const FACTOR = { mg: 0.001, g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125, ml: 1, l: 1000, gal: 3785.411784, und: 1, doc: 12 };
  const FAMILIA = { mg: "peso", g: "peso", kg: "peso", lb: "peso", oz: "peso", ml: "volumen", l: "volumen", gal: "volumen", und: "piezas", doc: "piezas" };
  const compatibles = (u) => Object.keys(UNIDADES).filter((x) => FAMILIA[x] === FAMILIA[u]);
  function convertir(cant, de, a) {
    if (!FACTOR[de] || !FACTOR[a] || FAMILIA[de] !== FAMILIA[a]) return Number(cant) || 0;
    return (Number(cant) || 0) * FACTOR[de] / FACTOR[a];
  }
  const precioPor = (p) => p.precio_unidad || p.unidad;

  const precioEn = (p, u) => Number(p.precio) * convertir(1, u, precioPor(p));

  const importeItem = (it) => Math.round(convertir(it.cantidad, it.unidad, it.precio_unidad || it.unidad) * (Number(it.precio) || 0) * 100) / 100;
  function opcionesUnidad(sel, lista) {
    return (lista || Object.keys(UNIDADES)).map((u) => '<option value="' + u + '"' + (u === sel ? " selected" : "") + ">" + NOMBRE_UNIDAD[u] + "</option>").join("");
  }
  function opcionesUnidadCorta(sel, lista) {
    return (lista || Object.keys(UNIDADES)).map((u) => '<option value="' + u + '"' + (u === sel ? " selected" : "") + ">" + UNIDADES[u] + "</option>").join("");
  }
  const METODOS = { efectivo: "Efectivo", transferencia: "Transferencia", deposito: "Depósito a cuenta", tarjeta: "Tarjeta", cheque: "Cheque", credito: "Crédito", otro: "Otro" };
  function opcionesMetodo(sel) { return Object.entries(METODOS).map(([k, v]) => '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + v + "</option>").join(""); }
  function nombreProd(p) { return (p.nombre + (p.presentacion ? " " + p.presentacion : "")).trim(); }
  function chipEstado(e) {
    const x = { pendiente: ["Pendiente de pago", "warn"], parcial: ["Abonado", "info"], pagado: ["Pagado", "ok"], anulada: ["Anulada", "mal"] }[e] || [e, ""];
    return '<span class="chip ' + x[1] + '">' + esc(x[0]) + "</span>";
  }

  function norm(s) { return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function buscar(lista, texto, campos) {
    const palabras = norm(texto).split(/\s+/).filter(Boolean);
    if (!palabras.length) return lista;
    return lista.filter((x) => { const t = norm(campos(x).join(" ")); return palabras.every((p) => t.includes(p)); });
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 160); }; }

  let contToast = null;
  function aviso(msg, tipo) {
    if (!contToast) {
      contToast = document.createElement("div");
      contToast.className = "toasts";
      contToast.setAttribute("role", "status");
      contToast.setAttribute("aria-live", "polite");
      document.body.appendChild(contToast);
    }
    const t = document.createElement("div");
    t.className = "toast " + (tipo || "info");
    t.textContent = msg;
    contToast.appendChild(t);
    setTimeout(() => { t.classList.add("sale"); setTimeout(() => t.remove(), 300); }, 4000);
  }
  async function accion(boton, fn, okMsg) {
    const original = boton ? boton.innerHTML : "";
    if (boton) { boton.disabled = true; boton.classList.add("cargando"); }
    try { const r = await fn(); if (okMsg) aviso(okMsg, "ok"); return r; }
    catch (e) { aviso(e.message, "error"); return undefined; }
    finally { if (boton) { boton.disabled = false; boton.classList.remove("cargando"); boton.innerHTML = original; } }
  }
  function modal(html, alAbrir, ancho) {
    const fondo = document.createElement("div");
    fondo.className = "modal-fondo";
    fondo.innerHTML = '<div class="modal' + (ancho ? " ancho" : "") + '" role="dialog" aria-modal="true"><button class="modal-x" type="button" aria-label="Cerrar">&times;</button>' + html + "</div>";
    const cerrar = () => { fondo.remove(); document.removeEventListener("keydown", tecla); };
    const tecla = (e) => { if (e.key === "Escape") cerrar(); };
    fondo.addEventListener("click", (e) => { if (e.target === fondo) cerrar(); });
    fondo.querySelector(".modal-x").addEventListener("click", cerrar);
    document.addEventListener("keydown", tecla);
    document.body.appendChild(fondo);
    const primero = fondo.querySelector("input:not([type=hidden]):not([type=checkbox]),select,textarea");
    if (primero) primero.focus();
    if (alAbrir) alAbrir(fondo.querySelector(".modal"), cerrar);
    return cerrar;
  }
  function confirmar(texto, etiqueta, peligro) {
    return new Promise((ok) => {
      modal('<h3>Confirmar</h3><p class="muted">' + esc(texto) + '</p><div class="fila-btns"><button class="btn ghost" data-no type="button">Volver</button><button class="btn ' + (peligro ? "peligro" : "primario") + '" data-si type="button">' + esc(etiqueta || "Sí, continuar") + "</button></div>",
        (m, cerrar) => {
          m.querySelector("[data-si]").onclick = () => { cerrar(); ok(true); };
          m.querySelector("[data-no]").onclick = () => { cerrar(); ok(false); };
        });
    });
  }
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); aviso("Copiado", "ok"); }
    catch (_e) { aviso("No se pudo copiar, cópialo a mano", "error"); }
  }
  function pestanas(raiz, alCambiar) {
    const botones = $$("[data-tab]", raiz).filter((b) => !b.hidden);
    const mostrar = (id) => {
      botones.forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
      $$("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== id; });
      history.replaceState(null, "", "#" + id);
      if (alCambiar) alCambiar(id);
    };
    botones.forEach((b) => b.addEventListener("click", () => mostrar(b.dataset.tab)));
    const inicial = location.hash.slice(1);
    mostrar(botones.some((b) => b.dataset.tab === inicial) ? inicial : botones[0].dataset.tab);
    return mostrar;
  }

  let audioCtx = null;
  function pitido(error) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = error ? "square" : "sine"; o.frequency.value = error ? 220 : 1400;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (error ? 0.35 : 0.12));
      o.connect(g).connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.4);
      if (navigator.vibrate) navigator.vibrate(error ? [80, 60, 80] : 40);
    } catch (_e) { /* sin audio */ }
  }
  document.addEventListener("pointerdown", () => { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (_e) { /* */ } }, { once: true });

  function ocupado() {
    if (document.querySelector(".modal-fondo")) return true;
    const a = document.activeElement;
    return !!(a && a.matches && a.matches("input, textarea, select"));
  }
  function refrescoVivo(fn, ms) {
    const tick = async () => { if (document.visibilityState === "visible" && !ocupado()) { try { await fn(); } catch (_e) { /* */ } } setTimeout(tick, ms || 60000); };
    setTimeout(tick, ms || 60000);
  }

  const COLORES = ["#38bdf8", "#2dd4bf", "#a78bfa", "#fbbf24", "#f472b6", "#34d399", "#fb923c", "#60a5fa"];
  function corta(t, n) { t = String(t); return t.length > n ? t.slice(0, n - 1) + "…" : t; }
  function barrasH(items, color) {
    if (!items.length) return '<p class="vacio">Sin datos en este periodo</p>';
    const max = Math.max(1, ...items.map((i) => i.valor));
    return '<div class="barras-h">' + items.map((it, k) =>
      '<div class="bh-fila"><span class="bh-etq" title="' + esc(it.etq) + '">' + esc(corta(it.etq, 24)) + '</span><span class="bh-pista"><span class="bh-barra" style="width:' +
      Math.max(3, 100 * it.valor / max) + "%;background:" + (color || COLORES[k % COLORES.length]) + '"></span></span><span class="bh-val">' + (it.texto ?? dinero(it.valor)) + "</span></div>").join("") + "</div>";
  }

  function csv(nombre, filas) {
    const texto = filas.map((f) => f.map((c) => '"' + String(c ?? "").replace(/"/g, '""') + '"').join(";")).join("\n");
    const blob = new Blob(["\ufeff" + texto], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function whatsapp(numero, texto) {
    const n = String(numero || "").replace(/\D/g, "");
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(texto);
  }

  const U = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince",
    "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco",
    "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
  const DEC = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const CEN = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
  function menorMil(n) {
    if (n === 0) return "";
    if (n === 100) return "cien";
    const c = Math.floor(n / 100), r = n % 100;
    let t = CEN[c];
    if (r) t += (t ? " " : "") + (r < 30 ? U[r] : DEC[Math.floor(r / 10)] + (r % 10 ? " y " + U[r % 10] : ""));
    return t;
  }
  function enLetras(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return "cero";
    const millones = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000;
    const partes = [];
    if (millones) partes.push(millones === 1 ? "un millón" : enLetras(millones) + " millones");
    if (miles) partes.push(miles === 1 ? "mil" : menorMil(miles) + " mil");
    if (resto) partes.push(menorMil(resto));
    return partes.join(" ");
  }
  function cantidadConLetra(total, moneda) {
    const v = Math.round((Number(total) || 0) * 100) / 100;
    const enteros = Math.floor(v), cent = Math.round((v - enteros) * 100);
    let t = enLetras(enteros);
    if (/(^|\s)(millón|millones)$/.test(t)) t += " de";
    return (t + " " + (moneda || "pesos") + " " + String(cent).padStart(2, "0") + "/100").toUpperCase();
  }

  function imagenReducida(archivo, maxLado, calidad) {
    return new Promise((ok, mal) => {
      if (!archivo || !/^image\//.test(archivo.type)) return mal(new Error("Elige una imagen (PNG o JPG)"));
      const lector = new FileReader();
      lector.onerror = () => mal(new Error("No se pudo leer la imagen"));
      lector.onload = () => {
        const img = new Image();
        img.onerror = () => mal(new Error("Imagen inválida"));
        img.onload = () => {
          const k = Math.min(1, (maxLado || 500) / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          const png = c.toDataURL("image/png");
          ok(png.length < 450000 ? png : c.toDataURL("image/jpeg", calidad || 0.85));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  function svgCodigo(valor, opciones) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const fmt = /^\d{13}$/.test(valor) ? "EAN13" : "CODE128";
    try { window.JsBarcode(svg, valor, Object.assign({ format: fmt, margin: 0, background: "#ffffff", lineColor: "#000000" }, opciones || {})); }
    catch (_e) { window.JsBarcode(svg, valor, Object.assign({ format: "CODE128", margin: 0 }, opciones || {})); }
    return svg;
  }
  function svgAImagen(svg) {
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    });
  }
  async function etiquetaCanvas(p, conPrecio) {
    const W = 600, H = 300, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
    x.strokeStyle = "#d1d5db"; x.lineWidth = 2; x.strokeRect(1, 1, W - 2, H - 2);
    x.fillStyle = "#111"; x.textAlign = "left"; x.textBaseline = "top";
    x.font = "700 30px system-ui, sans-serif";
    let titulo = nombreProd(p);
    while (x.measureText(titulo).width > W - 190 && titulo.length > 4) titulo = titulo.slice(0, -2);
    if (titulo !== nombreProd(p)) titulo += "…";
    x.fillText(titulo, 22, 20);
    x.font = "500 20px system-ui, sans-serif"; x.fillStyle = "#555";
    x.fillText(conPrecio ? dinero(p.precio) + " / " + (UNIDADES[precioPor(p)] || precioPor(p)) : (p.categoria || ""), 22, 58);

    const largo = await svgAImagen(svgCodigo(p.codigo_barras, { height: 110, width: 3, displayValue: true, fontSize: 22, textMargin: 4 }));
    const anchoL = Math.min(400, largo.width), altoL = largo.height * (anchoL / largo.width);
    x.drawImage(largo, 22, 100, anchoL, Math.min(170, altoL));

    x.fillStyle = "#111"; x.fillRect(W - 160, 16, 142, 56);
    x.fillStyle = "#fff"; x.textAlign = "center"; x.font = "800 34px ui-monospace, monospace";
    x.fillText(p.codigo_corto, W - 89, 26);
    const corto = await svgAImagen(svgCodigo(p.codigo_corto, { format: "CODE128", height: 90, width: 3, displayValue: false }));
    const anchoC = Math.min(140, corto.width);
    x.drawImage(corto, W - 89 - anchoC / 2, 100, anchoC, 110);
    x.fillStyle = "#555"; x.font = "600 15px system-ui, sans-serif";
    x.fillText("CÓDIGO CORTO", W - 89, 220);
    return c;
  }
  function descargar(url, nombre) {
    const a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function nombreArchivo(t) { return norm(t).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "archivo"; }

  window.Inv = {
    llamar, guardarSesion, borrarSesion, salir, exigir, rol, hayToken, info,
    $, $$, esc, dinero, cifra, numero, fecha, fechaCorta, hoy, sumarDias, inicioMes, inicioSemana,
    UNIDADES, NOMBRE_UNIDAD, FACTOR, FAMILIA, compatibles, convertir, precioPor, precioEn, importeItem, opcionesUnidad, opcionesUnidadCorta, METODOS, opcionesMetodo, nombreProd, chipEstado,
    norm, buscar, debounce, aviso, accion, modal, confirmar, copiar, pestanas,
    pitido, refrescoVivo, barrasH, COLORES, csv, whatsapp,
    cantidadConLetra, imagenReducida, svgCodigo, etiquetaCanvas, descargar, nombreArchivo,
  };
})();
