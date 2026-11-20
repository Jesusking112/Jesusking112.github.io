(function () {
  "use strict";
  const C = window.Conj, $ = C.$, $$ = C.$$, esc = C.esc;
  const yo = C.exigir("guardia");
  if (!yo) return;

  $("#t-conjunto").textContent = yo.conjunto || "Conjunto";
  $("#salir").addEventListener("click", C.salir);

  let P = { visitas: [], recientes: [], paquetes: [], casas: [] };
  let tipoN = "visita", casaN = null, casaQ = null;
  let vistos = null;            // ids de autorizados ya conocidos
  const pendientes = new Map(); // anuncios esperando respuesta: id -> nombre
  const casa = (id) => P.casas.find((c) => c.id === id) || { codigo: "—", propietario: "" };

  async function cargar() {
    P = await C.llamar("gu_panel");
    const esperados = P.visitas.filter((v) => v.estado === "esperado");
    const adentro = P.visitas.filter((v) => v.estado === "adentro");
    const espera = P.visitas.filter((v) => v.estado === "por_autorizar");

    // pitido cuando una casa autoriza a alguien nuevo
    const ids = new Set(esperados.map((v) => v.id));
    if (vistos) {
      const nuevos = esperados.filter((v) => !vistos.has(v.id));
      if (nuevos.length) { C.sonar(); C.aviso("Nuevo autorizado: " + nuevos.map((v) => v.nombre + " → " + casa(v.casa_id).codigo).join(", "), "ok"); }
    }
    vistos = ids;

    // respuestas a lo que anunció la portería
    const resp = [];
    for (const [id, nombre] of pendientes) {
      const v = [...P.visitas, ...P.recientes].find((x) => x.id === id);
      if (!v || v.estado === "cancelado") { pendientes.delete(id); continue; }
      if (v.estado === "por_autorizar") continue;
      pendientes.delete(id);
      resp.push(v);
      C.sonar(v.estado !== "esperado");
      C.aviso(nombre + ": " + (v.estado === "esperado" ? "AUTORIZADO" : "NO autorizado"), v.estado === "esperado" ? "ok" : "error");
    }
    espera.forEach((v) => { if (!pendientes.has(v.id)) pendientes.set(v.id, v.nombre); });
    if (resp.length) pintarRespuestas(resp);

    $("#contadores").innerHTML =
      '<div class="contador"><b>' + esperados.length + "</b><span>Autorizados</span></div>" +
      '<div class="contador"><b>' + adentro.length + "</b><span>Adentro</span></div>" +
      '<div class="contador"><b>' + espera.length + "</b><span>Esperando casa</span></div>" +
      '<div class="contador"><b>' + P.paquetes.length + "</b><span>Paquetes</span></div>";
    const b = $("#b-esp"); b.hidden = !esperados.length; b.textContent = esperados.length;

    const tipos = [...new Set(esperados.map((v) => v.tipo))];
    const sel = $("#e-tipo"), prev = sel.value;
    sel.innerHTML = '<option value="">Todos los tipos</option>' + tipos.map((t) => '<option value="' + t + '">' + esc(C.TIPOS_VISITA[t] || t) + "</option>").join("");
    sel.value = tipos.includes(prev) ? prev : "";
    pintarTodo();
  }

  function pintarRespuestas(lista) {
    const box = $("#respuestas");
    box.innerHTML = lista.map((v) => '<div class="banner ' + (v.estado === "esperado" ? "info" : "mal") + '"><span><b>' + esc(v.nombre) + " → " + esc(casa(v.casa_id).codigo) + ":</b> " +
      (v.estado === "esperado" ? "la casa lo AUTORIZÓ. Regístralo en Autorizados." : "la casa NO lo autorizó.") + '</span><button class="btn mini" type="button" data-cerrar>Entendido</button></div>').join("") + box.innerHTML;
  }
  $("#respuestas").addEventListener("click", (e) => { const b = e.target.closest("[data-cerrar]"); if (b) b.closest(".banner").remove(); });

  const camposVisita = (v) => { const c = casa(v.casa_id); return [v.nombre, v.documento, v.placa, c.codigo, c.propietario, C.TIPOS_VISITA[v.tipo], v.nota]; };
  function itemVisita(v, boton) {
    const c = casa(v.casa_id);
    return '<div class="item" data-vis="' + v.id + '"><div class="principal"><b>' + esc(v.nombre) + " → " + esc(c.codigo) + "</b><small>" +
      esc([C.TIPOS_VISITA[v.tipo], c.propietario, v.documento ? "Doc " + v.documento : "", v.placa ? "Placa " + v.placa : "", v.hasta ? "Frecuente hasta " + C.fecha(v.hasta) : "", v.ingreso_at ? "Entró " + C.hora(v.ingreso_at) : "", v.nota].filter(Boolean).join(" · ")) +
      "</small></div>" + C.chipVisita(v.estado) + (boton ? '<div class="acc">' + boton + "</div>" : "") + "</div>";
  }
  function pintarTodo() {
    let esp = C.buscar(P.visitas.filter((v) => v.estado === "esperado"), $("#e-buscar").value, camposVisita);
    if ($("#e-tipo").value) esp = esp.filter((v) => v.tipo === $("#e-tipo").value);
    $("#e-conteo").textContent = esp.length + " autorizados";
    $("#e-lista").innerHTML = esp.length ? esp.map((v) => itemVisita(v, '<button class="btn ok" data-g="ingreso" type="button">Registrar entrada</button>')).join("") : '<p class="vacio">Nadie autorizado con ese filtro.</p>';

    const ad = C.buscar(P.visitas.filter((v) => v.estado === "adentro"), $("#a-buscar").value, camposVisita);
    $("#a-conteo").textContent = ad.length + " adentro";
    $("#a-lista").innerHTML = ad.length ? ad.map((v) => itemVisita(v, '<button class="btn" data-g="salida" type="button">Registrar salida</button>')).join("") : '<p class="vacio">No hay visitantes adentro.</p>';

    const espera = P.visitas.filter((v) => v.estado === "por_autorizar");
    $("#n-espera").innerHTML = espera.length ? espera.map((v) => itemVisita(v, '<button class="btn mini peligro" data-g="cancelar" type="button">Cancelar</button>')).join("") : '<p class="vacio">No hay preguntas pendientes.</p>';

    const paq = C.buscar(P.paquetes, $("#p-buscar").value, (p) => { const c = casa(p.casa_id); return [c.codigo, c.propietario, p.descripcion, p.empresa]; });
    $("#p-conteo").textContent = paq.length + " por entregar";
    $("#p-lista").innerHTML = paq.length ? paq.map((p) => { const c = casa(p.casa_id); return '<div class="item" data-paq="' + p.id + '"><div class="principal"><b>' + esc(c.codigo) + " · " + esc(p.descripcion) + "</b><small>" + esc([c.propietario, p.empresa, "Llegó " + C.fecha(p.recibido_at, true)].filter(Boolean).join(" · ")) + '</small></div><div class="acc"><button class="btn mini ok" data-g="entregar" type="button">Entregar</button></div></div>'; }).join("") : '<p class="vacio">No hay paquetes por entregar.</p>';

    const rec = C.buscar(P.recientes, $("#r-buscar").value, camposVisita);
    $("#r-conteo").textContent = rec.length + " registros";
    $("#r-lista").innerHTML = rec.length ? rec.map((v) => itemVisita(v)).join("") : '<p class="vacio">Sin registros recientes.</p>';

    pintarCasas("#n-buscar", "#n-casas", casaN);
    pintarCasas("#q-buscar", "#q-casas", casaQ);
  }
  ["#e-buscar", "#a-buscar", "#p-buscar", "#r-buscar"].forEach((s) => $(s).addEventListener("input", C.debounce(pintarTodo)));
  $("#e-tipo").addEventListener("change", pintarTodo);

  function pintarCasas(inp, cont, elegida) {
    const l = C.buscar(P.casas, $(inp).value, (c) => [c.codigo, c.propietario]).slice(0, 60);
    $(cont).innerHTML = l.map((c) => '<button type="button" data-casa="' + c.id + '" class="' + (c.id === elegida ? "on" : "") + '" aria-pressed="' + (c.id === elegida) + '"><b>' + esc(c.codigo) + "</b><small>" + esc(c.propietario || "") + "</small></button>").join("") || '<p class="vacio">Sin casas</p>';
  }
  $("#n-buscar").addEventListener("input", C.debounce(() => pintarCasas("#n-buscar", "#n-casas", casaN)));
  $("#q-buscar").addEventListener("input", C.debounce(() => pintarCasas("#q-buscar", "#q-casas", casaQ)));
  $("#n-casas").addEventListener("click", (e) => { const b = e.target.closest("[data-casa]"); if (b) { casaN = b.dataset.casa; pintarCasas("#n-buscar", "#n-casas", casaN); } });
  $("#q-casas").addEventListener("click", (e) => { const b = e.target.closest("[data-casa]"); if (b) { casaQ = b.dataset.casa; pintarCasas("#q-buscar", "#q-casas", casaQ); } });

  $("#n-tipo").innerHTML = Object.entries(C.TIPOS_VISITA).map(([k, v]) => '<button type="button" class="opcion' + (k === tipoN ? " on" : "") + '" data-t="' + k + '">' + v + "</button>").join("");
  $("#n-tipo").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; tipoN = b.dataset.t; $$("#n-tipo [data-t]").forEach((x) => x.classList.toggle("on", x === b)); });

  $("#f-anunciar").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!casaN) return C.aviso("Elige la casa", "error");
    const f = e.currentTarget;
    const d = Object.assign({ casa_id: casaN, tipo: tipoN }, Object.fromEntries(new FormData(f)));
    const r = await C.accion(e.submitter, () => C.llamar("gu_anunciar", d), "Le preguntamos a la casa " + casa(casaN).codigo);
    if (!r) return;
    pendientes.set(r.id, r.nombre);
    f.reset(); casaN = null; $("#n-buscar").value = "";
    cargar().catch(() => {});
  });

  $("#f-paquete").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!casaQ) return C.aviso("Elige la casa", "error");
    const f = e.currentTarget;
    const r = await C.accion(e.submitter, () => C.llamar("gu_paquete", Object.assign({ casa_id: casaQ }, Object.fromEntries(new FormData(f)))), "Paquete registrado. La casa recibe aviso.");
    if (!r) return;
    f.reset(); casaQ = null; $("#q-buscar").value = "";
    cargar().catch(() => {});
  });

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-g]"); if (!b) return;
    const g = b.dataset.g;
    let r;
    if (g === "entregar") {
      const id = b.closest("[data-paq]").dataset.paq;
      C.modal('<h3>Entregar paquete</h3><form class="pila"><label class="campo"><span>¿A quién se lo entregas?</span><input name="entregado_a" placeholder="Nombre de quien recibe"></label><div class="fila-btns"><button class="btn primario" type="submit">Confirmar entrega</button></div></form>',
        (m, cerrar) => m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const x = await C.accion(ev.submitter, () => C.llamar("gu_paquete_entregar", { id, entregado_a: ev.currentTarget.entregado_a.value }), "Paquete entregado");
          if (x) { cerrar(); cargar().catch(() => {}); }
        });
      return;
    }
    const id = b.closest("[data-vis]").dataset.vis;
    if (g === "ingreso") r = await C.accion(b, () => C.llamar("gu_ingreso", { id }), "Entrada registrada");
    if (g === "salida") r = await C.accion(b, () => C.llamar("gu_salida", { id }), "Salida registrada");
    if (g === "cancelar") { r = await C.accion(b, () => C.llamar("gu_anuncio_cancelar", { id }), "Pregunta cancelada"); pendientes.delete(id); }
    if (r) cargar().catch(() => {});
  });

  // ------------------------------------------------------------------ escanear pases QR
  // Paso 1: el servidor revisa el QR y muestra los datos. Paso 2: el portero confirma que coinciden.
  // Paso 3: confirma entrada/salida; el servidor vuelve a validar todo antes de registrar.
  let lectura = null;
  const esc2 = C.pases.escaner($("#esc-cam"), (codigo) => { cerrarCamara(); revisarCodigo(codigo); });
  function cerrarCamara() { esc2.detener(); $("#esc-cam").hidden = true; $("#esc-abrir").textContent = "Abrir cámara"; }
  $("#esc-abrir").addEventListener("click", async () => {
    if (esc2.activo()) return cerrarCamara();
    $("#esc-cam").hidden = false; $("#esc-abrir").textContent = "Cerrar cámara";
    try { await esc2.iniciar(); }
    catch (e) { cerrarCamara(); C.aviso(e && e.name === "NotAllowedError" ? "Da permiso de cámara al navegador para escanear" : (e.message || "No se pudo abrir la cámara"), "error"); }
  });
  $("#esc-manual").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = $("#esc-codigo").value.trim(); if (!c) return;
    revisarCodigo(c);
  });

  const fh = (iso) => (iso ? C.pases.fh(iso) : "");
  async function revisarCodigo(codigo) {
    $("#esc-res").innerHTML = '<p class="vacio">Revisando pase…</p>';
    let r;
    try { r = await C.llamar("gu_pase_ver", { codigo }); } catch (e) { $("#esc-res").innerHTML = '<p class="vacio">' + esc(e.message) + "</p>"; return C.sonar(); }
    lectura = { codigo, r };
    C.sonar(r.ok);
    pintarLectura();
    if (window.matchMedia("(max-width: 860px)").matches) $("#esc-res").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function pintarLectura(paso) {
    const { r } = lectura, x = r.datos || {};
    const res = r.clase === "residente";
    const estado = !r.ok ? ["mal", "NO VÁLIDO", r.motivo] : r.accion === "entrada" ? ["ok", "PUEDE ENTRAR", res ? "Residente de la casa" : "Pase de invitado vigente"] : ["info", "VA A SALIR", res ? "Residente que está adentro" : "Invitado que está adentro"];
    const filas = [
      ["Casa", x.casa], [res ? "Propietario" : "Lo invita", x.propietario], ["Documento", x.documento], ["Placa", x.placa],
      ["Tipo", res ? "Residente" : C.TIPOS_VISITA[x.tipo] || x.tipo],
      ["Válido desde", fh(x.desde)], ["Válido hasta", fh(x.hasta)],
      ["Entradas", res ? "" : String(x.entradas || 0)], ["Último movimiento", fh(res ? x.mov_at : x.salida_at || x.ingreso_at)], ["Nota", x.nota],
    ].filter((f) => f[1]);
    let pie;
    if (!r.ok) pie = '<button class="btn grande bloque" type="button" data-e="otro">Escanear otro</button>';
    else if (paso === 2) pie = '<p class="muted" style="margin:0 0 8px">Paso 2 de 2. Confirma el registro:</p><div class="fila-btns" style="justify-content:stretch"><button class="btn ghost" type="button" data-e="otro">Cancelar</button>' +
      '<button class="btn ' + (r.accion === "entrada" ? "ok" : "primario") + ' grande" type="button" data-e="usar">Confirmar ' + (r.accion === "entrada" ? "ENTRADA" : "SALIDA") + "</button></div>";
    else pie = '<p class="muted" style="margin:0 0 8px">Paso 1 de 2. Mira a la persona y compara nombre, documento y placa.</p><div class="fila-btns" style="justify-content:stretch">' +
      '<button class="btn peligro" type="button" data-e="nocoincide">No coincide</button><button class="btn primario grande" type="button" data-e="coincide">Sí, los datos son correctos</button></div>';
    $("#esc-res").innerHTML = '<div class="esc-estado ' + estado[0] + '"><b>' + estado[1] + "</b><span>" + esc(estado[2]) + "</span></div>" +
      (x.nombre ? '<div class="esc-quien"><span class="chip ' + (res ? "info" : "warn") + '">' + (res ? "Residente" : "Invitado") + "</span><h3>" + esc(x.nombre) + "</h3></div>" : "") +
      (filas.length ? '<dl class="datos-pase">' + filas.map((f) => "<dt>" + f[0] + "</dt><dd>" + esc(f[1]) + "</dd>").join("") + "</dl>" : "") +
      '<div class="esc-pie">' + pie + "</div>";
  }

  $("#esc-res").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-e]"); if (!b || !lectura) return;
    const a = b.dataset.e;
    if (a === "coincide") return pintarLectura(2);
    if (a === "nocoincide") { C.sonar(); C.aviso("No registres el paso. Llama a la casa si tienes dudas.", "error"); return reiniciarEscaneo(); }
    if (a === "otro") return reiniciarEscaneo();
    if (a === "usar") {
      const x = await C.accion(b, () => C.llamar("gu_pase_usar", { codigo: lectura.codigo, accion: lectura.r.accion }));
      if (!x) return;
      C.sonar(true);
      $("#esc-res").innerHTML = '<div class="esc-estado ' + (x.accion === "entrada" ? "ok" : "info") + '"><b>' + (x.accion === "entrada" ? "ENTRADA REGISTRADA" : "SALIDA REGISTRADA") + "</b><span>" + esc(x.nombre) + " · " + C.hora(new Date().toISOString()) + "</span></div>" +
        '<div class="esc-pie"><button class="btn primario grande bloque" type="button" data-e="otro">Escanear otro</button></div>';
      lectura = { codigo: "", r: { ok: false } };
      cargar().catch(() => {});
    }
  });
  function reiniciarEscaneo() {
    lectura = null; $("#esc-codigo").value = "";
    $("#esc-res").innerHTML = '<p class="vacio">Aquí verás los datos de la persona cuando escanees su QR.</p>';
    $("#esc-abrir").click();
  }

  const btnSonido = $("#sonido");
  btnSonido.addEventListener("click", async () => { await C.activarAudio(); C.sonar(true); btnSonido.hidden = true; });

  C.pestanas(document, (id) => { if (id !== "escanear") cerrarCamara(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") cerrarCamara(); });
  cargar().catch((e) => C.aviso(e.message, "error"));
  C.refrescoVivo(cargar, 12000);
})();
