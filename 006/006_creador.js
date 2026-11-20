(function () {
  "use strict";
  const C = window.Conj, $ = C.$, esc = C.esc;
  let conjuntos = [];

  const ORIGEN = location.href.replace(/006_creador\.html.*$/, "");

  function iniciar() {
    if (C.hayToken() && C.rol() === "creador") return mostrarPanel();
    $("#v-login").hidden = false;
    const motivo = sessionStorage.getItem("conj006_motivo");
    if (motivo) { C.aviso(motivo, "error"); sessionStorage.removeItem("conj006_motivo"); }
  }

  $("#f-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await C.accion(e.submitter, () => C.llamar("creador_login", { clave: e.currentTarget.clave.value }));
    if (!r) return;
    C.guardarSesion(r);
    mostrarPanel();
  });

  async function mostrarPanel() {
    $("#v-login").hidden = true;
    $("#v-panel").hidden = false;
    $("#salir").hidden = false;
    await cargar();
    if (!refrescoActivo) { refrescoActivo = true; C.refrescoVivo(cargar, 60000); }
  }
  let refrescoActivo = false;
  $("#salir").addEventListener("click", C.salir);

  let pagos = [], pendientesAntes = null, platCargada = false;
  async function cargar() {
    try {
      [conjuntos, pagos] = await Promise.all([C.llamar("cr_listar"), C.llamar("cr_sus_pagos")]);
    } catch (e) { C.aviso(e.message, "error"); return; }
    const pend = pagos.filter((p) => p.estado === "por_validar").length;
    if (pendientesAntes !== null && pend > pendientesAntes) { C.sonar(true); C.aviso("Un conjunto reportó un pago", "info"); }
    pendientesAntes = pend;
    pintarKpis();
    pintar();
    pintarPagos();
    if (!platCargada) cargarPlataforma();
  }

  // ---------------------------------------------------------------- pagos de suscripción
  function pintarPagos() {
    const f = $("#p-estado").value;
    let lista = C.buscar(pagos, $("#p-texto").value, (p) => [p.conjunto, p.referencia, p.nota]);
    if (f) lista = lista.filter((p) => p.estado === f);
    const pend = pagos.filter((p) => p.estado === "por_validar").length;
    const badge = $("#badge-sus");
    badge.hidden = !pend; badge.textContent = pend;
    $("#p-conteo").textContent = lista.length + " de " + pagos.length;
    $("#p-lista").innerHTML = lista.length ? lista.map((p) => '<div class="item" data-pid="' + p.id + '"><div class="principal"><b>' + esc(p.conjunto) + " · " +
      C.dinero(p.monto) + "</b><small>" + p.meses + " " + (p.meses === 1 ? "mes" : "meses") + " · Ref: " + esc(p.referencia || "—") + " · " +
      C.fecha(String(p.creado_at).slice(0, 10)) + (p.nota ? "<br>" + esc(p.nota) : "") + (p.respuesta ? "<br>Respuesta: " + esc(p.respuesta) : "") +
      "</small></div>" + C.chipPago(p.estado) +
      (p.estado === "por_validar" ? '<div class="acc"><button class="btn mini ok" data-p="si" type="button">Aprobar</button><button class="btn mini peligro" data-p="no" type="button">Rechazar</button></div>' : "") +
      "</div>").join("") : '<p class="vacio">No hay pagos con ese filtro.</p>';
  }
  $("#p-texto").addEventListener("input", C.debounce(pintarPagos));
  $("#p-estado").addEventListener("change", pintarPagos);

  $("#p-lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-p]");
    if (!b) return;
    const p = pagos.find((x) => x.id === b.closest("[data-pid]").dataset.pid);
    const aprobar = b.dataset.p === "si";
    C.modal("<h3>" + (aprobar ? "Aprobar pago" : "Rechazar pago") + "</h3><p class=\"muted\">" + esc(p.conjunto) + " · " + C.dinero(p.monto) + " · Ref " + esc(p.referencia || "—") +
      (aprobar ? "<br>Se sumarán " + p.meses + " " + (p.meses === 1 ? "mes" : "meses") + " al vencimiento (" + C.fecha(p.vence) + ")." : "") + '</p><form class="pila">' +
      '<label class="campo"><span>Mensaje para el administrador (opcional)</span><input name="respuesta" placeholder="' + (aprobar ? "¡Gracias por tu pago!" : "No encontré la transferencia") + '"></label>' +
      '<div class="fila-btns"><button class="btn ' + (aprobar ? "primario" : "peligro") + '" type="submit">' + (aprobar ? "Aprobar y renovar" : "Rechazar") + "</button></div></form>",
      (m, cerrar) => m.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        const r = await C.accion(ev.submitter, () => C.llamar("cr_sus_pago_revisar", { id: p.id, aprobar, respuesta: ev.currentTarget.respuesta.value }), aprobar ? "Pago aprobado" : "Pago rechazado");
        if (r) { cerrar(); if (r.vence) C.aviso("Nuevo vencimiento: " + C.fecha(r.vence), "ok"); cargar(); }
      });
  });

  // ---------------------------------------------------------------- dónde te pagan
  let qrActual = null, qrCambiado = false;
  function pintarQr() {
    $("#qr-prev").innerHTML = qrActual ? '<img src="' + esc(qrActual) + '" alt="QR de pago">' : '<span class="muted">Sin QR</span>';
  }
  async function cargarPlataforma() {
    let p;
    try { p = await C.llamar("cr_plataforma"); } catch (e) { return C.aviso(e.message, "error"); }
    platCargada = true;
    const f = $("#f-plat");
    ["nequi", "daviplata", "llave", "titular", "banco", "whatsapp", "horario", "notas"].forEach((k) => { f[k].value = p[k] || ""; });
    qrActual = p.qr || null; qrCambiado = false;
    pintarQr();
  }
  $("#qr-file").addEventListener("change", (e) => {
    const archivo = e.target.files[0];
    e.target.value = "";
    if (!archivo) return;
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const max = 560, k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      qrActual = cv.toDataURL("image/jpeg", 0.9); qrCambiado = true;
      pintarQr();
      C.aviso("QR listo. Pulsa Guardar para publicarlo.", "info");
    };
    img.onerror = () => { URL.revokeObjectURL(url); C.aviso("No se pudo leer esa imagen", "error"); };
    img.src = url;
  });
  $("#qr-quitar").addEventListener("click", () => { qrActual = null; qrCambiado = true; pintarQr(); });
  $("#f-plat").addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    if (qrCambiado) datos.qr = qrActual || "";
    const r = await C.accion(e.submitter, () => C.llamar("cr_plataforma_guardar", datos), "Datos de pago guardados");
    if (r) qrCambiado = false;
  });

  function estadoDe(c) {
    if (c.estado === "suspendido") return ["Suspendido", "mal", "suspendido"];
    if (c.vence && c.vence < C.hoy()) return ["Vencido", "mal", "vencido"];
    if (c.vence && c.vence <= C.sumarDias(C.hoy(), 7)) return ["Vence pronto", "warn", "vence"];
    return ["Activo", "ok", "activo"];
  }

  function pintarKpis() {
    const activos = conjuntos.filter((c) => estadoDe(c)[2] === "activo" || estadoDe(c)[2] === "vence");
    const ingreso = activos.reduce((a, c) => a + Number(c.plan_mensual || 0), 0);
    const casas = conjuntos.reduce((a, c) => a + Number(c.casas || 0), 0);
    const porVencer = conjuntos.filter((c) => estadoDe(c)[2] === "vence").length;
    $("#kpis").innerHTML =
      '<div class="kpi"><span>Conjuntos</span><b>' + conjuntos.length + "</b><small>" + activos.length + " activos</small></div>" +
      '<div class="kpi ok"><span>Ingreso mensual</span><b>' + C.dinero(ingreso) + "</b><small>de conjuntos activos</small></div>" +
      '<div class="kpi"><span>Casas totales</span><b>' + casas + "</b><small>en todos los conjuntos</small></div>" +
      '<div class="kpi warn"><span>Vencen en 7 días</span><b>' + porVencer + "</b><small>para cobrar</small></div>" +
      '<div class="kpi info"><span>Pagos por validar</span><b>' + pagos.filter((p) => p.estado === "por_validar").length + "</b><small>" +
        C.dinero(pagos.filter((p) => p.estado === "aprobado" && String(p.creado_at).slice(0, 7) === C.periodoActual()).reduce((a, p) => a + Number(p.monto), 0)) + " cobrado este mes</small></div>";
  }

  function pintar() {
    const filtro = $("#b-estado").value;
    let lista = C.buscar(conjuntos, $("#b-texto").value, (c) => [c.nombre, c.ciudad, c.telefono, ...(c.admins || []).map((a) => a.usuario)]);
    if (filtro) lista = lista.filter((c) => estadoDe(c)[2] === filtro || (filtro === "activo" && estadoDe(c)[2] === "vence"));
    $("#b-conteo").textContent = lista.length + " de " + conjuntos.length;
    $("#lista").innerHTML = lista.length ? lista.map((c) => {
      const [txt, cls] = estadoDe(c);
      const admin = (c.admins || [])[0];
      return '<div class="item" data-id="' + c.id + '"><div class="principal"><b>' + esc(c.nombre) + "</b><small>" +
        esc([c.ciudad, c.casas + " casas", admin ? "admin: " + admin.usuario : "sin admin"].filter(Boolean).join(" · ")) +
        "<br>Vence: " + C.fecha(c.vence) + " · " + C.dinero(c.plan_mensual) + "/mes</small></div>" +
        '<span class="chip ' + cls + '">' + txt + "</span>" +
        '<div class="acc"><button class="btn mini ok" data-a="renovar" type="button">Renovar</button>' +
        '<button class="btn mini" data-a="editar" type="button">Editar</button>' +
        '<button class="btn mini" data-a="clave" type="button">Clave admin</button>' +
        '<button class="btn mini" data-a="estado" type="button">' + (c.estado === "suspendido" ? "Activar" : "Suspender") + "</button>" +
        '<button class="btn mini peligro" data-a="borrar" type="button">Borrar</button></div></div>';
    }).join("") : '<p class="vacio">No hay conjuntos con ese filtro.</p>';
  }
  $("#b-texto").addEventListener("input", C.debounce(pintar));
  $("#b-estado").addEventListener("change", pintar);

  $("#f-crear").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const datos = Object.fromEntries(new FormData(f));
    const r = await C.accion(e.submitter, () => C.llamar("cr_crear", datos), "Conjunto creado");
    if (!r) return;
    const texto = "Hola, ya está listo el acceso de " + datos.nombre + ".\n\nEntra en: " + ORIGEN + "006_inicio.html\nUsuario: " + r.usuario + "\nClave: " + datos.admin_clave + "\n\nDesde ahí creas las casas y la portería.";
    const box = $("#creado");
    box.hidden = false;
    box.className = "banner info";
    box.style.marginTop = "14px";
    box.innerHTML = '<div><b>Comparte este acceso con el administrador:</b><br><span class="muted">Usuario: ' + esc(r.usuario) + " · Clave: " + esc(datos.admin_clave) +
      '</span></div><div class="fila"><button class="btn mini" type="button" id="cp">Copiar</button><a class="btn mini wa" target="_blank" rel="noopener" href="' +
      C.whatsapp(datos.telefono, texto) + '">Enviar por WhatsApp</a></div>';
    $("#cp").onclick = () => C.copiar(texto);
    f.reset();
    await cargar();
  });

  $("#lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const c = conjuntos.find((x) => x.id === b.closest("[data-id]").dataset.id);
    const a = b.dataset.a;
    if (a === "renovar") {
      C.modal('<h3>Renovar ' + esc(c.nombre) + '</h3><p class="muted">Vence: ' + C.fecha(c.vence) + '. Se suma desde la fecha de vencimiento (o desde hoy si ya venció).</p><div class="opciones">' +
        [1, 3, 6, 12].map((m) => '<button class="opcion" data-m="' + m + '" type="button">+' + m + " " + (m === 1 ? "mes" : "meses") + "</button>").join("") + "</div>",
        (m, cerrar) => m.querySelectorAll("[data-m]").forEach((x) => x.onclick = async () => {
          const r = await C.accion(x, () => C.llamar("cr_renovar", { id: c.id, meses: Number(x.dataset.m) }));
          if (r) { cerrar(); C.aviso("Nuevo vencimiento: " + C.fecha(r.vence), "ok"); cargar(); }
        }));
    }
    if (a === "editar") {
      C.modal('<h3>Editar conjunto</h3><form class="pila"><div class="campos">' +
        '<label class="campo ancho"><span>Nombre</span><input name="nombre" value="' + esc(c.nombre) + '" required></label>' +
        '<label class="campo"><span>Ciudad</span><input name="ciudad" value="' + esc(c.ciudad || "") + '"></label>' +
        '<label class="campo"><span>Teléfono</span><input name="telefono" value="' + esc(c.telefono || "") + '"></label>' +
        '<label class="campo"><span>Valor mensual</span><input name="plan_mensual" type="number" value="' + Number(c.plan_mensual || 0) + '"></label>' +
        '<label class="campo"><span>Vence</span><input name="vence" type="date" value="' + esc(c.vence || "") + '"></label></div>' +
        '<div class="fila-btns"><button class="btn primario" type="submit">Guardar</button></div></form>',
        (m, cerrar) => m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const r = await C.accion(ev.submitter, () => C.llamar("cr_editar", Object.assign({ id: c.id }, Object.fromEntries(new FormData(ev.currentTarget)))), "Guardado");
          if (r) { cerrar(); cargar(); }
        });
    }
    if (a === "clave") {
      const admin = (c.admins || [])[0];
      C.modal('<h3>Clave del administrador</h3><p class="muted">Cambia la clave (o crea el usuario si no existe). Cierra sus sesiones abiertas.</p><form class="pila">' +
        '<label class="campo"><span>Usuario</span><input name="usuario" value="' + esc(admin ? admin.usuario : "") + '" required></label>' +
        '<label class="campo"><span>Nueva clave</span><input name="clave" required minlength="4"></label>' +
        '<div class="fila-btns"><button class="btn primario" type="submit">Guardar clave</button></div></form>',
        (m, cerrar) => m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const d = Object.fromEntries(new FormData(ev.currentTarget));
          const r = await C.accion(ev.submitter, () => C.llamar("cr_admin_clave", Object.assign({ conjunto_id: c.id }, d)), "Clave actualizada");
          if (r) { cerrar(); cargar(); }
        });
    }
    if (a === "estado") {
      const nuevo = c.estado === "suspendido" ? "activo" : "suspendido";
      if (!(await C.confirmar(nuevo === "suspendido" ? "Nadie de " + c.nombre + " podrá entrar hasta que lo actives." : "Se activará el acceso de " + c.nombre + ".", nuevo === "suspendido" ? "Suspender" : "Activar", nuevo === "suspendido"))) return;
      const r = await C.accion(b, () => C.llamar("cr_editar", { id: c.id, estado: nuevo }), "Listo");
      if (r) cargar();
    }
    if (a === "borrar") {
      C.modal('<h3>Borrar conjunto</h3><p class="muted">Se borra TODO: casas, cobros, pagos, visitas. No se puede deshacer. Escribe el nombre exacto para confirmar:</p><form class="pila">' +
        '<input name="confirmar" placeholder="' + esc(c.nombre) + '" required><div class="fila-btns"><button class="btn peligro" type="submit">Borrar definitivamente</button></div></form>',
        (m, cerrar) => m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const r = await C.accion(ev.submitter, () => C.llamar("cr_borrar", { id: c.id, confirmar: ev.currentTarget.confirmar.value }), "Conjunto borrado");
          if (r) { cerrar(); cargar(); }
        });
    }
  });

  iniciar();
})();
