/* =============================================================================
   006 · Cliente compartido de Conjuntos
   Lo usan TODAS las páginas 006_*.html. Solo cambia estas 2 constantes
   con los datos de tu proyecto Supabase (Settings > API).
   ============================================================================= */
(function () {
  "use strict";

  const FUNCION_URL = "https://djbvgglroelnescxkjcw.supabase.co/functions/v1/conjuntos";
  const SUPABASE_ANON_KEY = "sb_publishable_v0wAgT-Bbui1ytwpARw4lg_vnKOttEX";

  const K_TOKEN = "conj006_token", K_ROL = "conj006_rol", K_INFO = "conj006_info";
  const PAGINA = { admin: "006_admin.html", casa: "006_casa.html", guardia: "006_guardia.html", creador: "006_creador.html" };

  // ---------------------------------------------------------------- transporte
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
        sessionStorage.setItem("conj006_motivo", msg.replace("SESION:", "").trim());
        const destino = eraCreador ? "006_creador.html" : "006_inicio.html";
        if (!location.pathname.endsWith(destino)) location.href = destino;
        throw new Error(msg.replace("SESION:", "").trim());
      }
      throw new Error(msg);
    }
    return json.data;
  }

  // ---------------------------------------------------------------- sesión persistente
  function guardarSesion(r) {
    localStorage.setItem(K_TOKEN, r.token);
    localStorage.setItem(K_ROL, r.rol);
    localStorage.setItem(K_INFO, JSON.stringify({ nombre: r.nombre, conjunto: r.conjunto }));
  }
  function borrarSesion() { [K_TOKEN, K_ROL, K_INFO].forEach((k) => localStorage.removeItem(k)); }
  function rol() { return localStorage.getItem(K_ROL); }
  function hayToken() { return !!localStorage.getItem(K_TOKEN); }
  function info() { try { return JSON.parse(localStorage.getItem(K_INFO) || "{}"); } catch (_e) { return {}; } }
  async function salir() {
    const eraCreador = rol() === "creador";
    try { await llamar("logout"); } catch (_e) { /* */ }
    borrarSesion();
    location.href = eraCreador ? "006_creador.html" : "006_inicio.html";
  }
  function exigir(r) {
    if (!hayToken() || rol() !== r) { location.href = r === "creador" ? "006_creador.html" : "006_inicio.html"; return null; }
    return info();
  }

  // ---------------------------------------------------------------- utilidades
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function dinero(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("es-CO"); }
  function fecha(iso, conHora) {
    if (!iso) return "—";
    const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
    const op = { day: "2-digit", month: "short", year: "numeric" };
    if (conHora) Object.assign(op, { hour: "2-digit", minute: "2-digit", year: undefined });
    return d.toLocaleString("es-CO", op);
  }
  function hora(iso) { return iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "—"; }
  function hoy() { return new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); }
  function periodoActual() { return hoy().slice(0, 7); }
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function nombrePeriodo(p) {
    if (!p) return "—";
    const [a, m] = p.split("-");
    return MESES[Number(m) - 1] + " " + a;
  }
  function mesCorto(p) { const [a, m] = p.split("-"); return MESES[Number(m) - 1].slice(0, 3) + " " + a.slice(2); }
  function sumarDias(f, n) { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  // ---------------------------------------------------------------- buscador avanzado
  function norm(s) { return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

  function buscar(lista, texto, campos) {
    const palabras = norm(texto).split(/\s+/).filter(Boolean);
    if (!palabras.length) return lista;
    return lista.filter((x) => {
      const t = norm(campos(x).join(" "));
      return palabras.every((p) => t.includes(p));
    });
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 160); }; }

  // ---------------------------------------------------------------- avisos y modales
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
    try {
      const r = await fn();
      if (okMsg) aviso(okMsg, "ok");
      return r;
    } catch (e) {
      aviso(e.message, "error");
      return undefined;
    } finally {
      if (boton) { boton.disabled = false; boton.classList.remove("cargando"); boton.innerHTML = original; }
    }
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
    const primero = fondo.querySelector("input:not([type=hidden]),select,textarea");
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

  // ---------------------------------------------------------------- pestañas
  function pestanas(raiz, alCambiar) {
    const botones = $$("[data-tab]", raiz);
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

  // ---------------------------------------------------------------- pitido tipo app de domicilios
  let audioCtx = null, alarmaTimer = null;
  function sonar(suave) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const pitido = (frec, t0) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = suave ? "sine" : "square"; o.frequency.value = frec;
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(suave ? 0.3 : 0.22, audioCtx.currentTime + t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t0 + 0.28);
        o.connect(g).connect(audioCtx.destination);
        o.start(audioCtx.currentTime + t0); o.stop(audioCtx.currentTime + t0 + 0.3);
      };
      if (suave) { pitido(988, 0); pitido(1319, 0.18); }
      else { pitido(880, 0); pitido(1175, 0.32); pitido(880, 0.64); pitido(1175, 0.96); }
      if (navigator.vibrate) navigator.vibrate(suave ? 200 : [300, 150, 300, 150, 300]);
    } catch (_e) { /* sin audio */ }
  }
  function iniciarAlarma() { if (alarmaTimer) return; sonar(); alarmaTimer = setInterval(() => sonar(), 4000); }
  function detenerAlarma() { clearInterval(alarmaTimer); alarmaTimer = null; }
  function audioListo() { return !!audioCtx && audioCtx.state === "running"; }
  function activarAudio() {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); return audioCtx.resume(); } catch (_e) { return Promise.resolve(); }
  }
  document.addEventListener("pointerdown", () => { activarAudio(); }, { once: true });

  function cadaTanto(fn, ms) {
    const tick = async () => { if (document.visibilityState === "visible") { try { await fn(); } catch (_e) { /* */ } } setTimeout(tick, ms); };
    setTimeout(tick, ms);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") fn().catch(() => {}); });
  }

  function ocupado() {
    if (document.querySelector(".modal-fondo")) return true;
    const a = document.activeElement;
    return !!(a && a.matches && a.matches("input, textarea, select"));
  }
  function refrescoVivo(fn, ms) {
    cadaTanto(async () => { if (!ocupado()) await fn(); }, ms || 60000);
  }

  const COLORES = ["#38bdf8", "#2dd4bf", "#a78bfa", "#fbbf24", "#f472b6", "#34d399", "#fb923c", "#60a5fa"];
  function corta(t, n) { t = String(t); return t.length > n ? t.slice(0, n - 1) + "…" : t; }

  function barras(series, nombres, colores) {
    if (!series.length) return '<p class="vacio">Sin datos todavía</p>';
    colores = colores || ["#38bdf8", "#2dd4bf"];
    const W = 520, H = 220, pad = 34, base = H - 28;
    const max = Math.max(1, ...series.flatMap((s) => s.valores));
    const grupo = (W - pad) / series.length, ancho = Math.min(22, (grupo - 12) / nombres.length);
    let svg = '<svg viewBox="0 0 ' + W + " " + H + '" class="svg-graf" role="img" aria-label="' + esc(nombres.join(" vs ")) + '">';
    for (let i = 0; i <= 3; i++) {
      const y = base - (base - 12) * i / 3;
      svg += '<line x1="' + pad + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" class="g-linea"/>';
      svg += '<text x="' + (pad - 6) + '" y="' + (y + 4) + '" class="g-eje" text-anchor="end">' + abreviar(max * i / 3) + "</text>";
    }
    series.forEach((s, i) => {
      const x0 = pad + grupo * i + (grupo - ancho * nombres.length - 4 * (nombres.length - 1)) / 2;
      s.valores.forEach((v, j) => {
        const h = Math.max(2, (base - 12) * v / max);
        svg += '<rect x="' + (x0 + j * (ancho + 4)) + '" y="' + (base - h) + '" width="' + ancho + '" height="' + h + '" rx="5" fill="' + colores[j] + '"><title>' + esc(nombres[j] + ": " + dinero(v)) + "</title></rect>";
      });
      svg += '<text x="' + (pad + grupo * i + grupo / 2) + '" y="' + (H - 8) + '" class="g-eje" text-anchor="middle">' + esc(s.etq) + "</text>";
    });
    svg += "</svg>";
    return svg + leyenda(nombres.map((n, j) => ({ etq: n, color: colores[j] })));
  }
  function abreviar(n) {
    n = Math.round(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
    if (n >= 1e3) return Math.round(n / 1e3) + "k";
    return String(n);
  }
  function dona(partes, centro, sub) {
    const total = partes.reduce((a, p) => a + Math.max(0, p.valor), 0);
    const R = 62, C = 2 * Math.PI * R;
    let acc = 0;
    let svg = '<div class="dona-wrap"><svg viewBox="0 0 160 160" class="svg-dona" role="img" aria-label="' + esc(sub || "Distribución") + '"><circle cx="80" cy="80" r="' + R + '" class="dona-fondo"/>';
    if (total > 0) {
      partes.forEach((p) => {
        const largo = C * Math.max(0, p.valor) / total;
        svg += '<circle cx="80" cy="80" r="' + R + '" fill="none" stroke="' + p.color + '" stroke-width="18" stroke-dasharray="' + largo + " " + (C - largo) + '" stroke-dashoffset="' + (-acc) + '" transform="rotate(-90 80 80)" stroke-linecap="butt"><title>' + esc(p.etq + ": " + p.valor) + "</title></circle>";
        acc += largo;
      });
    }
    svg += '<text x="80" y="78" text-anchor="middle" class="dona-num">' + esc(centro) + '</text><text x="80" y="98" text-anchor="middle" class="dona-sub">' + esc(sub || "") + "</text></svg>";
    return svg + leyenda(partes.map((p) => ({ etq: p.etq + " · " + (p.texto ?? p.valor), color: p.color }))) + "</div>";
  }
  function barrasH(items, color) {
    if (!items.length) return '<p class="vacio">Sin datos en este periodo</p>';
    const max = Math.max(1, ...items.map((i) => i.valor));
    return '<div class="barras-h">' + items.map((it, k) =>
      '<div class="bh-fila"><span class="bh-etq" title="' + esc(it.etq) + '">' + esc(corta(it.etq, 22)) + '</span><span class="bh-pista"><span class="bh-barra" style="width:' +
      Math.max(3, 100 * it.valor / max) + "%;background:" + (color || COLORES[k % COLORES.length]) + '"></span></span><span class="bh-val">' + (it.texto ?? dinero(it.valor)) + "</span></div>").join("") + "</div>";
  }
  function leyenda(items) {
    return '<ul class="leyenda">' + items.map((i) => '<li><span style="background:' + i.color + '"></span>' + esc(i.etq) + "</li>").join("") + "</ul>";
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
    let n = String(numero || "").replace(/\D/g, "");
    if (n.length === 10) n = "57" + n;
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(texto);
  }

  const TIPOS_VISITA = { visita: "Visita", domicilio: "Domicilio", servicio: "Servicio técnico", taxi: "Taxi / transporte", trabajador: "Empleado(a) / trabajador", otro: "Otro" };
  const ESTADOS_VISITA = {
    por_autorizar: ["Esperando respuesta", "warn"], esperado: ["Autorizado", "info"], adentro: ["Adentro", "ok"],
    salio: ["Salió", "neutro"], rechazado: ["No autorizado", "mal"], cancelado: ["Cancelado", "neutro"],
  };
  function chipVisita(e) { const x = ESTADOS_VISITA[e] || [e, ""]; return '<span class="chip ' + x[1] + '">' + esc(x[0]) + "</span>"; }
  const ESTADOS_PAGO = { por_validar: ["Por validar", "warn"], aprobado: ["Aprobado", "ok"], rechazado: ["Rechazado", "mal"] };
  function chipPago(e) { const x = ESTADOS_PAGO[e] || [e, ""]; return '<span class="chip ' + x[1] + '">' + esc(x[0]) + "</span>"; }
  function estadoCobro(c) {
    const falta = Number(c.monto) - Number(c.pagado);
    if (falta <= 0) return '<span class="chip ok">Pagado</span>';
    if (Number(c.pagado) > 0) return '<span class="chip warn">Abonado</span>';
    if (c.vence && c.vence < hoy()) return '<span class="chip mal">Vencido</span>';
    return '<span class="chip info">Pendiente</span>';
  }

  function tarjetaPago(p, monto) {
    p = p || {};
    const filas = [["Nequi", p.nequi], ["Daviplata", p.daviplata], ["Llave Bre-B", p.llave], ["Cuenta bancaria", p.banco], ["Titular", p.titular]]
      .filter((x) => x[1]);
    if (!filas.length && !p.qr) return '<p class="vacio">El proveedor aún no ha publicado sus datos de pago. Escríbele por WhatsApp.</p>';
    return '<div class="pago-plat">' +
      (p.qr ? '<div class="qr-caja"><img src="' + esc(p.qr) + '" alt="Código QR para pagar"></div>' +
        '<ol class="pasos"><li>Abre <b>Nequi</b> o la app de tu banco.</li><li>Toca el ícono de <b>QR</b> y escanea esta imagen.</li><li>Ingresa ' +
        (monto ? "<b>" + dinero(monto) + "</b>" : "el valor") + " y confirma la transacción.</li></ol>" : "") +
      (filas.length ? '<div class="pila">' + filas.map((x) => '<div class="dato-pago"><div><small>' + esc(x[0]) + "</small><b>" + esc(x[1]) +
        '</b></div><button class="btn mini" type="button" data-copiar="' + esc(x[1]) + '">Copiar</button></div>').join("") + "</div>" : "") +
      (p.notas ? '<p class="muted" style="margin:0">' + esc(p.notas) + "</p>" : "") + "</div>";
  }
  function enlazarCopiar(raiz) {
    raiz.addEventListener("click", (e) => { const b = e.target.closest("[data-copiar]"); if (b) copiar(b.dataset.copiar); });
  }

  window.Conj = {
    tarjetaPago, enlazarCopiar,
    llamar, guardarSesion, borrarSesion, salir, exigir, rol, hayToken, info, PAGINA,
    $, $$, esc, dinero, fecha, hora, hoy, periodoActual, nombrePeriodo, mesCorto, sumarDias,
    norm, buscar, debounce, aviso, accion, modal, confirmar, copiar, pestanas,
    sonar, iniciarAlarma, detenerAlarma, audioListo, activarAudio, cadaTanto, refrescoVivo,
    barras, dona, barrasH, leyenda, abreviar, COLORES, csv, whatsapp,
    TIPOS_VISITA, chipVisita, chipPago, estadoCobro,
  };
})();
