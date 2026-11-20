(function () {
  "use strict";
  const C = window.Conj, $ = C.$, $$ = C.$$, esc = C.esc, din = C.dinero;
  const yo = C.exigir("admin");
  if (!yo) return;

  $("#t-conjunto").textContent = yo.conjunto || "Administración";
  $("#t-usuario").textContent = yo.nombre || "Panel del administrador";
  $("#salir").addEventListener("click", C.salir);

  const PER = C.periodoActual();
  ["#r-periodo", "#gm-periodo", "#g-periodo", "#c-periodo", "#k-periodo"].forEach((s) => { $(s).value = PER; });
  $("#v-desde").value = C.sumarDias(C.hoy(), -30); $("#v-hasta").value = C.hoy();
  $("#m-desde").value = PER + "-01"; $("#m-hasta").value = C.hoy();
  $("#p-desde").value = C.sumarDias(C.hoy(), -90); $("#p-hasta").value = C.hoy();

  const E = {
    conjunto: null, casas: [], casasPeriodo: null, conceptos: [], cobros: [], pagos: [], movs: [],
    porteria: { visitas: [], paquetes: [] }, comunicados: [], usuarios: [],
  };
  const casaPorId = (id) => E.casas.find((c) => c.id === id) || { codigo: "—", propietario: "" };
  const err = (e) => C.aviso(e.message, "error");

  C.llamar("adm_conjunto").then((c) => { E.conjunto = c; }).catch(() => {});

  async function datosCasas(periodo, forzar) {
    periodo = periodo || PER;
    if (!forzar && E.casas.length && E.casasPeriodo === periodo) return E.casas;
    const r = await C.llamar("adm_casas", { periodo });
    E.casas = r.casas; E.casasPeriodo = periodo;
    return E.casas;
  }
  async function datosConceptos(forzar) {
    if (!forzar && E.conceptos.length) return E.conceptos;
    E.conceptos = await C.llamar("adm_conceptos");
    const opts = E.conceptos.map((c) => '<option value="' + c.id + '">' + esc(c.nombre) + "</option>").join("");
    $("#g-concepto").innerHTML = '<option value="">Otro (escribir nombre)</option>' + opts;
    $("#c-concepto").innerHTML = '<option value="">Todos los servicios</option>' + opts;
    return E.conceptos;
  }

  function avisoVence(c) {
    const box = $("#aviso-vence");
    box.innerHTML = "";
    marcarPlan(c);
    if (!c || !c.vence) return;
    const dias = Math.round((new Date(c.vence + "T12:00:00") - new Date(C.hoy() + "T12:00:00")) / 86400e3);
    if (dias > 7) return;
    box.innerHTML = '<div class="banner ' + (dias < 0 ? "mal" : "warn") + '"><span>' + (dias < 0
      ? "La suscripción venció el " + C.fecha(c.vence) + ". Tienes unos días de gracia antes de que se bloquee el acceso."
      : "La suscripción vence el " + C.fecha(c.vence) + " (en " + dias + " días).") +
      '</span><button class="btn mini primario" type="button" id="ir-plan">Pagar ahora</button></div>';
    $("#ir-plan").onclick = () => irA("suscripcion");
  }

  function mensajeRecordatorio(c) {
    const nombre = (E.conjunto && E.conjunto.nombre) || yo.conjunto || "el conjunto";
    return "Hola" + (c.propietario ? " " + c.propietario : "") + ", te saludamos de la administración de " + nombre + ". La casa " + c.codigo +
      " tiene un saldo pendiente de " + din(c.deuda) + ". Puedes ver el detalle y reportar tu pago desde la app. ¡Gracias!";
  }

  // ===================================================================== RESUMEN
  async function cargarResumen() {
    const p = $("#r-periodo").value || PER;
    let r;
    try { r = await C.llamar("adm_resumen", { periodo: p }); } catch (e) { return err(e); }
    const m = r.metricas;
    avisoVence(r.conjunto);
    $("#r-titulo").textContent = "Resumen de " + C.nombrePeriodo(p);
    const pct = m.facturado_mes > 0 ? Math.round(100 * m.recaudado_mes / m.facturado_mes) : 0;
    const entradas = Number(m.entradas_mes) + Number(m.otros_ingresos_mes);
    const balance = entradas - Number(m.egresos_mes);
    $("#r-kpis").innerHTML =
      '<div class="kpi"><span>Facturado del mes</span><b>' + din(m.facturado_mes) + "</b><small>" + m.casas_total + " casas activas</small></div>" +
      '<div class="kpi ok"><span>Recaudado del mes</span><b>' + din(m.recaudado_mes) + "</b><small>" + pct + '% del facturado</small><div class="barra-prog"><i style="width:' + Math.min(100, pct) + '%"></i></div></div>' +
      '<div class="kpi mal"><span>Cartera total</span><b>' + din(m.cartera) + "</b><small>" + din(m.cartera_vencida) + " vencida · " + m.casas_morosas + " casas en mora</small></div>" +
      '<div class="kpi ' + (balance >= 0 ? "ok" : "mal") + '"><span>Caja del mes</span><b>' + din(balance) + "</b><small>Entró " + din(entradas) + " · Salió " + din(m.egresos_mes) + "</small></div>" +
      '<div class="kpi warn"><span>Pagos por validar</span><b>' + m.pagos_por_validar + "</b><small>revisa la pestaña Pagos</small></div>" +
      '<div class="kpi"><span>Portería hoy</span><b>' + m.visitas_hoy + "</b><small>visitas · " + m.paquetes_pendientes + " paquetes sin entregar</small></div>";
    const badge = $("#badge-pagos");
    badge.hidden = !m.pagos_por_validar;
    badge.textContent = m.pagos_por_validar;

    $("#g-recaudo").innerHTML = C.barras(m.serie_recaudo.map((x) => ({ etq: C.mesCorto(x.periodo), valores: [Number(x.facturado), Number(x.recaudado)] })), ["Facturado", "Recaudado"]);
    const conCobro = m.casas_pagadas + m.casas_parciales + m.casas_pendientes;
    $("#g-casas").innerHTML = conCobro ? C.dona([
      { etq: "Pagaron", valor: m.casas_pagadas, color: "#34d399" },
      { etq: "Abonaron", valor: m.casas_parciales, color: "#fbbf24" },
      { etq: "No han pagado", valor: m.casas_pendientes, color: "#f87171" },
    ], m.casas_pagadas + "/" + conCobro, "casas al día") : '<p class="vacio">Aún no hay cobros este mes. Genéralos en la pestaña Cobros.</p>';
    $("#g-caja").innerHTML = C.barras(m.serie_caja.map((x) => ({ etq: C.mesCorto(x.mes), valores: [Number(x.ingresos), Number(x.egresos)] })), ["Entradas", "Gastos"], ["#2dd4bf", "#f87171"]);
    $("#g-conceptos").innerHTML = C.barrasH(m.por_concepto.map((x) => ({ etq: x.nombre, valor: Number(x.facturado), texto: din(x.recaudado) + " de " + din(x.facturado) })));
    $("#g-egresos").innerHTML = C.barrasH(m.egresos_categoria.map((x) => ({ etq: x.nombre, valor: Number(x.total) })), "#f87171");

    try { await datosCasas(p, true); } catch (e) { return err(e); }
    pintarMorosos();
  }
  function pintarMorosos() {
    const lista = C.buscar(E.casas.filter((c) => c.activa && (c.estado_mes === "pendiente" || c.estado_mes === "parcial")), $("#r-buscar").value, (c) => [c.codigo, c.propietario, c.telefono]);
    $("#r-morosos").innerHTML = lista.length ? lista.map((c) => itemCasa(c, true)).join("") : '<p class="vacio">Todas las casas con cobro este mes ya pagaron.</p>';
  }
  $("#r-periodo").addEventListener("change", cargarResumen);
  $("#r-buscar").addEventListener("input", C.debounce(pintarMorosos));
  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => irA(b.dataset.ir)));

  // ===================================================================== CASAS
  const ESTADO_MES = { pagado: ["Pagó", "ok"], parcial: ["Abonó", "warn"], pendiente: ["No ha pagado", "mal"], sin_cobro: ["Sin cobro", ""] };
  function itemCasa(c, corto) {
    const em = ESTADO_MES[c.estado_mes] || ["", ""];
    const usuario = (c.usuarios || [])[0];
    const recordar = c.telefono && c.deuda > 0
      ? '<a class="btn mini wa" target="_blank" rel="noopener" href="' + C.whatsapp(c.telefono, mensajeRecordatorio(c)) + '">Recordar</a>' : "";
    return '<div class="item' + (c.vencido > 0 ? " alerta" : "") + '" data-casa="' + c.id + '"><div class="principal"><b>' + esc(c.codigo) + (c.activa ? "" : ' <span class="chip">Inactiva</span>') + "</b><small>" +
      esc([c.propietario, c.telefono, usuario ? "usuario: " + usuario.usuario : "sin usuario"].filter(Boolean).join(" · ")) + "</small></div>" +
      '<span class="chip ' + em[1] + '">' + em[0] + "</span>" +
      '<div class="monto">' + (c.deuda > 0 ? din(c.deuda) : '<span class="muted">Al día</span>') + (c.vencido > 0 ? '<br><small class="muted">' + din(c.vencido) + " vencido</small>" : "") + "</div>" +
      '<div class="acc"><button class="btn mini" data-k="cuenta" type="button">Estado de cuenta</button><button class="btn mini ok" data-k="pago" type="button">Pago</button>' + recordar +
      (corto ? "" : '<button class="btn mini" data-k="editar" type="button">Editar</button>') + "</div></div>";
  }
  let filtroCasa = "";
  async function cargarCasas() {
    try { await datosCasas($("#k-periodo").value || PER, true); } catch (e) { return err(e); }
    pintarCasas();
  }
  function casasFiltradas() {
    let l = C.buscar(E.casas, $("#k-buscar").value, (c) => [c.codigo, c.propietario, c.telefono, c.correo, c.notas, ...(c.usuarios || []).map((u) => u.usuario)]);
    if (filtroCasa === "mora") l = l.filter((c) => c.vencido > 0);
    else if (filtroCasa === "sin_usuario") l = l.filter((c) => !(c.usuarios || []).length);
    else if (filtroCasa === "inactiva") l = l.filter((c) => !c.activa);
    else if (filtroCasa) l = l.filter((c) => c.estado_mes === filtroCasa && c.activa);
    const orden = $("#k-orden").value;
    if (orden === "deuda") l = l.slice().sort((a, b) => b.deuda - a.deuda);
    if (orden === "propietario") l = l.slice().sort((a, b) => String(a.propietario || "").localeCompare(String(b.propietario || "")));
    return l;
  }
  function pintarCasas() {
    const l = casasFiltradas();
    const deuda = l.reduce((a, c) => a + c.deuda, 0);
    $("#k-conteo").textContent = l.length + " de " + E.casas.length + " · deben " + din(deuda);
    $("#k-lista").innerHTML = l.length ? l.slice(0, 600).map((c) => itemCasa(c)).join("") : '<p class="vacio">' + (E.casas.length ? "Ninguna casa coincide." : "Aún no hay casas. Crea una o importa la lista.") + "</p>";
  }
  $("#k-buscar").addEventListener("input", C.debounce(pintarCasas));
  $("#k-orden").addEventListener("change", pintarCasas);
  $("#k-periodo").addEventListener("change", cargarCasas);
  $("#k-filtros").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    $$("#k-filtros button").forEach((x) => x.classList.toggle("on", x === b));
    filtroCasa = b.dataset.f; pintarCasas();
  });
  $("#k-csv").addEventListener("click", () => C.csv("casas-" + ($("#k-periodo").value || PER), [["Código", "Propietario", "Teléfono", "Correo", "Coeficiente", "Estado del mes", "Deuda", "Vencido", "Usuario"],
    ...casasFiltradas().map((c) => [c.codigo, c.propietario, c.telefono, c.correo, c.coeficiente, (ESTADO_MES[c.estado_mes] || [""])[0], c.deuda, c.vencido, (c.usuarios || []).map((u) => u.usuario).join(" ")])]));

  // clics en cualquier lista de casas (resumen o casas)
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]"); if (!b) return;
    const id = b.closest("[data-casa]").dataset.casa;
    const c = casaPorId(id);
    if (b.dataset.k === "cuenta") estadoCuenta(id);
    if (b.dataset.k === "pago") abrirPago(id);
    if (b.dataset.k === "editar") editarCasa(c);
  });

  function editarCasa(c) {
    const nueva = !c || !c.id;
    c = c || {};
    C.modal("<h3>" + (nueva ? "Nueva casa" : "Editar " + esc(c.codigo)) + '</h3><form class="pila"><div class="campos">' +
      '<label class="campo"><span>Código (casa / torre-apto)</span><input name="codigo" required value="' + esc(c.codigo || "") + '" placeholder="T1-302"></label>' +
      '<label class="campo"><span>Propietario o residente</span><input name="propietario" value="' + esc(c.propietario || "") + '"></label>' +
      '<label class="campo"><span>Teléfono (WhatsApp)</span><input name="telefono" inputmode="tel" value="' + esc(c.telefono || "") + '"></label>' +
      '<label class="campo"><span>Correo</span><input name="correo" type="email" value="' + esc(c.correo || "") + '"></label>' +
      '<label class="campo"><span>Coeficiente (opcional)</span><input name="coeficiente" type="number" step="0.00001" min="0" value="' + Number(c.coeficiente || 0) + '"></label>' +
      '<label class="campo ancho"><span>Notas internas</span><input name="notas" value="' + esc(c.notas || "") + '" placeholder="Ej: arrendatario, mascota, parqueadero 14"></label></div>' +
      '<label class="check"><input type="checkbox" name="activa" ' + (c.activa === false ? "" : "checked") + "> Casa activa (se le cobran los servicios)</label>" +
      (nueva || !(c.usuarios || []).length ? '<div class="sub pila"><b>Usuario para la casa (opcional)</b><div class="campos"><label class="campo"><span>Usuario</span><input name="usuario" autocapitalize="none"></label><label class="campo"><span>Clave</span><input name="clave"></label></div></div>' : "") +
      '<div class="fila-btns">' + (nueva ? "" : '<button class="btn peligro" type="button" data-borrar>Borrar</button>') + '<button class="btn primario" type="submit">Guardar</button></div></form>',
      (m, cerrar) => {
        m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const d = Object.fromEntries(new FormData(ev.currentTarget));
          d.activa = ev.currentTarget.activa.checked;
          d.id = c.id;
          const r = await C.accion(ev.submitter, () => C.llamar("adm_casa_guardar", d), "Casa guardada");
          if (r) { cerrar(); cargarCasas(); }
        };
        const bb = m.querySelector("[data-borrar]");
        if (bb) bb.onclick = async () => {
          if (!(await C.confirmar("Se borra la casa " + c.codigo + " con sus cobros y visitas.", "Borrar", true))) return;
          const r = await C.accion(bb, () => C.llamar("adm_casa_borrar", { id: c.id }), "Casa borrada");
          if (r) { cerrar(); cargarCasas(); }
        };
      });
  }
  $("#k-nueva").addEventListener("click", () => editarCasa(null));

  $("#k-importar").addEventListener("click", () => {
    C.modal('<h3>Importar casas</h3><p class="muted">Pega una casa por línea (desde Excel también sirve). Orden:<br><b>código ; propietario ; teléfono ; coeficiente ; usuario ; clave</b><br>Solo el código es obligatorio. Si el código ya existe, se actualiza.</p>' +
      '<textarea id="imp-t" style="min-height:180px" placeholder="T1-101;Ana Pérez;3001234567;0.85&#10;T1-102;Luis Gómez;3109876543;0.85;luis102;4821"></textarea><div id="imp-r"></div>' +
      '<div class="fila-btns"><button class="btn primario" type="button" id="imp-b">Importar</button></div>',
      (m) => {
        m.querySelector("#imp-b").onclick = async (ev) => {
          const r = await C.accion(ev.currentTarget, () => C.llamar("adm_casas_importar", { texto: m.querySelector("#imp-t").value }));
          if (!r) return;
          m.querySelector("#imp-r").innerHTML = '<div class="banner info" style="margin-top:12px"><span>Creadas: ' + r.creadas + " · Actualizadas: " + r.actualizadas + " · Usuarios: " + r.usuarios + "</span></div>" +
            (r.errores.length ? '<div class="banner mal"><span>' + r.errores.map(esc).join("<br>") + "</span></div>" : "");
          cargarCasas();
        };
      }, true);
  });

  $("#k-auto").addEventListener("click", () => {
    C.modal('<h3>Crear usuarios automáticos</h3><p class="muted">A cada casa activa que no tenga usuario se le crea uno con clave de 6 números. Las claves se muestran UNA sola vez: descarga el CSV o envíalas por WhatsApp.</p>' +
      '<label class="campo"><span>Prefijo del usuario</span><input id="au-p" placeholder="' + esc(((E.conjunto && E.conjunto.nombre) || "conjunto").toLowerCase().split(" ")[0]) + '"></label><div id="au-r"></div>' +
      '<div class="fila-btns"><button class="btn primario" id="au-b" type="button">Crear usuarios</button></div>',
      (m) => {
        m.querySelector("#au-b").onclick = async (ev) => {
          const r = await C.accion(ev.currentTarget, () => C.llamar("adm_casas_usuarios_auto", { prefijo: m.querySelector("#au-p").value }));
          if (!r) return;
          ev.currentTarget.hidden = true;
          const url = location.href.replace(/006_admin\.html.*$/, "006_inicio.html");
          const msg = (x) => "Hola" + (x.propietario ? " " + x.propietario : "") + ", este es tu acceso a la app del conjunto para ver tu cuenta, pagar y anunciar visitas.\n\n" + url + "\nUsuario: " + x.usuario + "\nClave: " + x.clave;
          m.querySelector("#au-r").innerHTML = r.creados.length
            ? '<div class="fila" style="margin:12px 0"><button class="btn" id="au-csv" type="button">Descargar CSV</button><span class="muted">' + r.creados.length + ' usuarios creados</span></div><div class="tabla-wrap"><table><thead><tr><th>Casa</th><th>Usuario</th><th>Clave</th><th></th></tr></thead><tbody>' +
              r.creados.map((x) => "<tr><td>" + esc(x.codigo) + "</td><td>" + esc(x.usuario) + "</td><td><b>" + esc(x.clave) + "</b></td><td>" +
                (x.telefono ? '<a class="btn mini wa" target="_blank" rel="noopener" href="' + C.whatsapp(x.telefono, msg(x)) + '">Enviar</a>' : '<span class="muted">sin teléfono</span>') + "</td></tr>").join("") + "</tbody></table></div>"
            : '<p class="vacio">Todas las casas activas ya tienen usuario.</p>';
          const b = m.querySelector("#au-csv");
          if (b) b.onclick = () => C.csv("usuarios-casas", [["Casa", "Propietario", "Teléfono", "Usuario", "Clave"], ...r.creados.map((x) => [x.codigo, x.propietario, x.telefono, x.usuario, x.clave])]);
          cargarCasas();
        };
      }, true);
  });

  async function estadoCuenta(casaId) {
    let r;
    try { r = await C.llamar("adm_estado_casa", { casa_id: casaId }); } catch (e) { return err(e); }
    const pend = r.cobros.filter((x) => Number(x.pagado) < Number(x.monto));
    const deuda = pend.reduce((a, x) => a + Number(x.monto) - Number(x.pagado), 0);
    const vencido = pend.filter((x) => x.vence && x.vence < C.hoy()).reduce((a, x) => a + Number(x.monto) - Number(x.pagado), 0);
    const casa = Object.assign({}, r.casa, { deuda });
    C.modal("<h3>Estado de cuenta · " + esc(casa.codigo) + '</h3><p class="muted" style="margin-top:-6px">' + esc(casa.propietario || "") + "</p>" +
      '<div class="kpis"><div class="kpi ' + (deuda > 0 ? "mal" : "ok") + '"><span>Debe</span><b>' + din(deuda) + '</b></div><div class="kpi warn"><span>Vencido</span><b>' + din(vencido) + '</b></div><div class="kpi ok"><span>Saldo a favor</span><b>' + din(casa.saldo_favor) + "</b></div></div>" +
      '<div class="fila" style="margin-bottom:12px"><button class="btn ok mini" data-x="pago" type="button">Registrar pago</button>' +
      (casa.telefono && deuda > 0 ? '<a class="btn wa mini" target="_blank" rel="noopener" href="' + C.whatsapp(casa.telefono, mensajeRecordatorio(casa)) + '">Recordar por WhatsApp</a>' : "") +
      (deuda <= 0 ? '<button class="btn mini" data-x="paz" type="button">Paz y salvo</button>' : "") + "</div>" +
      '<h3>Cobros</h3><div class="tabla-wrap" style="max-height:280px"><table><thead><tr><th>Mes</th><th>Servicio</th><th>Vence</th><th class="num">Valor</th><th class="num">Pagado</th><th>Estado</th></tr></thead><tbody>' +
      (r.cobros.map((x) => "<tr><td>" + C.nombrePeriodo(x.periodo) + "</td><td>" + esc(x.descripcion) + "</td><td>" + C.fecha(x.vence) + '</td><td class="num">' + din(x.monto) + '</td><td class="num">' + din(x.pagado) + "</td><td>" + C.estadoCobro(x) + "</td></tr>").join("") || '<tr><td colspan="6" class="vacio">Sin cobros</td></tr>') +
      '</tbody></table></div><h3 style="margin-top:16px">Pagos</h3><div class="lista corta">' +
      (r.pagos.map((p) => '<div class="item"><div class="principal"><b>' + din(p.monto) + "</b><small>" + esc([C.fecha(p.creado_at, true), p.metodo, p.referencia, p.reportado_por === "admin" ? "registrado por admin" : "reportado por la casa"].filter(Boolean).join(" · ")) + "</small></div>" + C.chipPago(p.estado) + "</div>").join("") || '<p class="vacio">Sin pagos</p>') + "</div>",
      (m, cerrar) => {
        m.querySelector("[data-x=pago]").onclick = () => { cerrar(); abrirPago(casaId); };
        const pz = m.querySelector("[data-x=paz]");
        if (pz) pz.onclick = () => pazYSalvo(casa);
      }, true);
  }

  function pazYSalvo(casa) {
    const c = E.conjunto || { nombre: yo.conjunto };
    const w = window.open("", "_blank");
    if (!w) return C.aviso("Permite las ventanas emergentes para imprimir", "error");
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Paz y salvo ' + esc(casa.codigo) +
      '</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 20px;line-height:1.7;color:#111}h1{font-size:22px;margin:0}small{color:#555}.f{margin-top:90px;border-top:1px solid #333;width:280px;padding-top:6px}</style></head><body>' +
      "<h1>" + esc(c.nombre) + "</h1><small>" + esc([c.nit ? "NIT " + c.nit : "", c.direccion, c.ciudad].filter(Boolean).join(" · ")) + "</small>" +
      '<h2 style="margin-top:40px">Certificado de paz y salvo</h2><p>La administración de <b>' + esc(c.nombre) + "</b> certifica que la unidad <b>" + esc(casa.codigo) + "</b>" +
      (casa.propietario ? ", a nombre de <b>" + esc(casa.propietario) + "</b>," : "") + " se encuentra a paz y salvo por todo concepto de cuotas y servicios a la fecha de " + C.fecha(C.hoy()) + ".</p>" +
      '<div class="f">Administración</div><script>window.print()<\/script></body></html>');
    w.document.close();
  }

  // ===================================================================== PAGOS
  let estadoPago = "por_validar";
  async function cargarPagos() {
    try {
      await datosCasas(E.casasPeriodo || PER);
      E.pagos = await C.llamar("adm_pagos", { estado: estadoPago, desde: $("#p-desde").value, hasta: $("#p-hasta").value });
    } catch (e) { return err(e); }
    const metodos = [...new Set(E.pagos.map((p) => p.metodo).filter(Boolean))];
    const sel = $("#p-metodo"), prev = sel.value;
    sel.innerHTML = '<option value="">Todos los métodos</option>' + metodos.map((m) => '<option value="' + esc(m) + '">' + esc(m) + "</option>").join("");
    sel.value = metodos.includes(prev) ? prev : "";
    pintarPagos();
  }
  function pagosFiltrados() {
    let l = C.buscar(E.pagos, $("#p-buscar").value, (p) => { const c = casaPorId(p.casa_id); return [c.codigo, c.propietario, p.referencia, p.metodo, p.nota, p.monto]; });
    if ($("#p-metodo").value) l = l.filter((p) => p.metodo === $("#p-metodo").value);
    return l;
  }
  function pintarPagos() {
    const l = pagosFiltrados();
    $("#p-conteo").textContent = l.length + " pagos · " + din(l.reduce((a, p) => a + Number(p.monto), 0));
    $("#p-lista").innerHTML = l.length ? l.map((p) => {
      const c = casaPorId(p.casa_id);
      return '<div class="item' + (p.estado === "por_validar" ? " alerta" : "") + '" data-pago="' + p.id + '"><div class="principal"><b>' + esc(c.codigo) + " · " + din(p.monto) + "</b><small>" +
        esc([c.propietario, C.fecha(p.creado_at, true), p.metodo, p.referencia ? "Ref: " + p.referencia : "", p.reportado_por === "admin" ? "registrado por admin" : "reportado por la casa"].filter(Boolean).join(" · ")) +
        (p.nota ? "<br>" + esc(p.nota) : "") + (p.motivo_rechazo ? "<br>Motivo: " + esc(p.motivo_rechazo) : "") + "</small></div>" + C.chipPago(p.estado) +
        (p.estado === "por_validar" ? '<div class="acc"><button class="btn mini ok" data-p="si" type="button">Aprobar</button><button class="btn mini peligro" data-p="no" type="button">Rechazar</button></div>' : "") + "</div>";
    }).join("") : '<p class="vacio">' + (estadoPago === "por_validar" ? "No hay pagos esperando validación." : "Sin pagos con ese filtro.") + "</p>";
  }
  $("#p-estados").addEventListener("click", (e) => {
    const b = e.target.closest("[data-e]"); if (!b) return;
    $$("#p-estados button").forEach((x) => x.classList.toggle("on", x === b));
    estadoPago = b.dataset.e; cargarPagos();
  });
  $("#p-buscar").addEventListener("input", C.debounce(pintarPagos));
  $("#p-metodo").addEventListener("change", pintarPagos);
  ["#p-desde", "#p-hasta"].forEach((s) => $(s).addEventListener("change", cargarPagos));
  $("#p-csv").addEventListener("click", () => C.csv("pagos", [["Fecha", "Casa", "Propietario", "Valor", "Método", "Referencia", "Estado", "Reportado por", "Nota"],
    ...pagosFiltrados().map((p) => { const c = casaPorId(p.casa_id); return [p.creado_at, c.codigo, c.propietario, p.monto, p.metodo, p.referencia, p.estado, p.reportado_por, p.nota]; })]));
  $("#p-lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-p]"); if (!b) return;
    const id = b.closest("[data-pago]").dataset.pago;
    if (b.dataset.p === "si") {
      const r = await C.accion(b, () => C.llamar("adm_pago_validar", { id, aprobar: true }), "Pago aprobado y aplicado a la deuda");
      if (r) cargarPagos();
      return;
    }
    C.modal('<h3>Rechazar pago</h3><form class="pila"><label class="campo"><span>Motivo (lo verá la casa)</span><input name="motivo" placeholder="No llegó la transferencia"></label><div class="fila-btns"><button class="btn peligro" type="submit">Rechazar</button></div></form>',
      (m, cerrar) => m.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        const r = await C.accion(ev.submitter, () => C.llamar("adm_pago_validar", { id, aprobar: false, motivo: ev.currentTarget.motivo.value }), "Pago rechazado");
        if (r) { cerrar(); cargarPagos(); }
      });
  });

  function selectorCasa(cont, inicial) {
    cont.innerHTML = '<div class="pila"><input placeholder="Buscar casa por código o propietario…" data-b aria-label="Buscar casa"><select data-s size="5" aria-label="Casa" style="min-height:140px"></select></div>';
    const s = $("[data-s]", cont);
    const pintar = () => {
      const l = C.buscar(E.casas, $("[data-b]", cont).value, (c) => [c.codigo, c.propietario]).slice(0, 300);
      const prev = s.value || inicial;
      s.innerHTML = l.map((c) => '<option value="' + c.id + '">' + esc(c.codigo + (c.propietario ? " — " + c.propietario : "") + (c.deuda > 0 ? " · debe " + din(c.deuda) : "")) + "</option>").join("");
      if (prev && l.some((c) => c.id === prev)) s.value = prev; else if (l.length === 1) s.value = l[0].id;
      s.dispatchEvent(new Event("change"));
    };
    pintar();
    $("[data-b]", cont).addEventListener("input", C.debounce(pintar));
    return s;
  }

  async function abrirPago(casaId) {
    try { await datosCasas(E.casasPeriodo || PER); } catch (e) { return err(e); }
    C.modal('<h3>Registrar pago</h3><p class="muted" style="margin-top:-4px">Queda aprobado de una vez y se descuenta de la deuda más antigua. Si sobra, queda como saldo a favor.</p><form class="pila"><div class="campo"><span>Casa</span><div id="pg-casa"></div></div><div class="campos">' +
      '<label class="campo"><span>Valor</span><input name="monto" type="number" min="1" required inputmode="numeric"></label>' +
      '<label class="campo"><span>Método</span><select name="metodo"><option>efectivo</option><option>transferencia</option><option>nequi</option><option>daviplata</option><option>consignación</option><option>otro</option></select></label>' +
      '<label class="campo"><span>Referencia / recibo</span><input name="referencia"></label>' +
      '<label class="campo"><span>Nota</span><input name="nota"></label></div>' +
      '<div class="fila-btns"><button class="btn primario" type="submit">Registrar pago</button></div></form>',
      (m, cerrar) => {
        const sel = selectorCasa(m.querySelector("#pg-casa"), casaId);
        const monto = m.querySelector("[name=monto]");
        sel.addEventListener("change", () => { const c = casaPorId(sel.value); if (c.deuda > 0) monto.value = Math.round(c.deuda); });
        sel.dispatchEvent(new Event("change"));
        m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          if (!sel.value) return C.aviso("Elige la casa", "error");
          const d = Object.fromEntries(new FormData(ev.currentTarget));
          d.casa_id = sel.value;
          const r = await C.accion(ev.submitter, () => C.llamar("adm_pago_registrar", d), "Pago registrado");
          if (r) { cerrar(); E.casasPeriodo = null; refrescarActual(); }
        };
      });
  }
  $("#p-nuevo").addEventListener("click", () => abrirPago(null));

  // ===================================================================== SERVICIOS Y REPARTO
  const REPARTOS = {
    fijo: ["Valor fijo por casa", "Todas pagan lo mismo", "Valor que paga cada casa"],
    igual: ["Dividir total entre todas", "Total ÷ número de casas", "Valor total a dividir"],
    coeficiente: ["Por coeficiente", "Según el coeficiente de cada casa", "Valor total a repartir"],
    seleccion: ["Solo algunas casas", "Eliges qué casas pagan", "Valor"],
    manual: ["Valor distinto por casa", "Escribes cuánto paga cada una", ""],
  };

  // Editor del detalle según el reparto. Devuelve una función que entrega el detalle actual.
  function editorDetalle(cont, reparto, det) {
    det = det || {};
    const activas = () => E.casas.filter((c) => c.activa);
    if (reparto === "seleccion") {
      const sel = new Set((det.casas || []).map(String));
      cont.innerHTML = '<div class="sub pila"><div class="buscador" style="margin:0"><label class="lupa"><span class="sr-only">Buscar casa</span><input data-b placeholder="Buscar casa…"></label>' +
        '<button class="btn mini" type="button" data-todas>Marcar visibles</button><button class="btn mini" type="button" data-ninguna>Quitar visibles</button><span class="conteo" data-c></span></div>' +
        '<label class="check"><input type="checkbox" data-cada ' + (det.cada ? "checked" : "") + "> Cada casa elegida paga el valor completo (no dividir)</label><div class=\"casa-pick\" data-l></div></div>";
      let visibles = [];
      const pintar = () => {
        visibles = C.buscar(activas(), $("[data-b]", cont).value, (c) => [c.codigo, c.propietario]);
        $("[data-c]", cont).textContent = sel.size + " elegidas";
        $("[data-l]", cont).innerHTML = visibles.map((c) => '<button type="button" data-id="' + c.id + '" class="' + (sel.has(c.id) ? "on" : "") + '" aria-pressed="' + sel.has(c.id) + '"><b>' + esc(c.codigo) + "</b><small>" + esc(c.propietario || "") + "</small></button>").join("") || '<p class="vacio">Sin casas</p>';
      };
      pintar();
      $("[data-b]", cont).addEventListener("input", C.debounce(pintar));
      $("[data-l]", cont).addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (!b) return; sel.has(b.dataset.id) ? sel.delete(b.dataset.id) : sel.add(b.dataset.id); pintar(); });
      $("[data-todas]", cont).onclick = () => { visibles.forEach((c) => sel.add(c.id)); pintar(); };
      $("[data-ninguna]", cont).onclick = () => { visibles.forEach((c) => sel.delete(c.id)); pintar(); };
      return () => ({ casas: [...sel], cada: $("[data-cada]", cont).checked });
    }
    if (reparto === "manual") {
      const montos = Object.assign({}, det.montos || {});
      cont.innerHTML = '<div class="sub pila"><div class="buscador" style="margin:0"><label class="lupa"><span class="sr-only">Buscar casa</span><input data-b placeholder="Buscar casa…"></label>' +
        '<input type="number" data-mismo placeholder="Mismo valor" style="width:150px" aria-label="Mismo valor para las casas visibles"><button class="btn mini" type="button" data-aplicar>Aplicar a visibles</button><span class="conteo" data-c></span></div>' +
        '<div class="tabla-wrap" style="max-height:320px"><table><thead><tr><th>Casa</th><th>Propietario</th><th class="num">Valor</th></tr></thead><tbody data-l></tbody></table></div></div>';
      let visibles = [];
      const total = () => { const t = Object.values(montos).reduce((a, v) => a + (Number(v) || 0), 0); $("[data-c]", cont).textContent = "Total " + din(t); };
      const pintar = () => {
        visibles = C.buscar(activas(), $("[data-b]", cont).value, (c) => [c.codigo, c.propietario]);
        $("[data-l]", cont).innerHTML = visibles.map((c) => "<tr><td>" + esc(c.codigo) + "</td><td>" + esc(c.propietario || "") + '</td><td class="num"><input type="number" min="0" data-id="' + c.id + '" value="' + (montos[c.id] || "") + '" aria-label="Valor ' + esc(c.codigo) + '" style="width:130px"></td></tr>').join("") || '<tr><td colspan="3" class="vacio">Sin casas</td></tr>';
        total();
      };
      pintar();
      $("[data-b]", cont).addEventListener("input", C.debounce(pintar));
      $("[data-l]", cont).addEventListener("input", (e) => { const i = e.target.closest("[data-id]"); if (!i) return; if (Number(i.value) > 0) montos[i.dataset.id] = Number(i.value); else delete montos[i.dataset.id]; total(); });
      $("[data-aplicar]", cont).onclick = () => { const v = Number($("[data-mismo]", cont).value); visibles.forEach((c) => { if (v > 0) montos[c.id] = v; else delete montos[c.id]; }); pintar(); };
      return () => ({ montos });
    }
    cont.innerHTML = "";
    return () => ({});
  }

  function opcionesReparto(cont, actual, alCambiar) {
    cont.innerHTML = Object.entries(REPARTOS).map(([k, v]) => '<button type="button" class="opcion' + (k === actual ? " on" : "") + '" data-r="' + k + '">' + v[0] + "<small>" + v[1] + "</small></button>").join("");
    cont.onclick = (e) => {
      const b = e.target.closest("[data-r]"); if (!b) return;
      $$("[data-r]", cont).forEach((x) => x.classList.toggle("on", x === b));
      alCambiar(b.dataset.r);
    };
  }

  async function cargarConceptos() {
    try { await Promise.all([datosConceptos(true), datosCasas(E.casasPeriodo || PER)]); } catch (e) { return err(e); }
    pintarConceptos();
  }
  function pintarConceptos() {
    const l = C.buscar(E.conceptos, $("#s-buscar").value, (c) => [c.nombre, REPARTOS[c.reparto][0]]);
    $("#s-conteo").textContent = l.length + " servicios";
    $("#s-lista").innerHTML = l.length ? l.map((c) => {
      const det = c.reparto === "seleccion" ? (c.detalle.casas || []).length + " casas" : c.reparto === "manual" ? Object.keys(c.detalle.montos || {}).length + " casas con valor" : "";
      return '<div class="item" data-con="' + c.id + '"><div class="principal"><b>' + esc(c.nombre) + "</b><small>" + esc([REPARTOS[c.reparto][0], det].filter(Boolean).join(" · ")) + "</small></div>" +
        (c.reparto !== "manual" ? '<span class="monto">' + din(c.monto) + "</span>" : "") +
        '<span class="chip ' + (c.recurrente ? "info" : "") + '">' + (c.recurrente ? "Cada mes" : "Una vez") + "</span>" + (c.activo ? "" : '<span class="chip">Inactivo</span>') +
        '<div class="acc"><button class="btn mini ok" data-s="cobrar" type="button">Cobrar ahora</button><button class="btn mini" data-s="editar" type="button">Editar</button><button class="btn mini peligro" data-s="borrar" type="button">Borrar</button></div></div>';
    }).join("") : '<p class="vacio">Aún no hay servicios. Usa una de las ideas de abajo para empezar.</p>';
  }
  $("#s-buscar").addEventListener("input", C.debounce(pintarConceptos));

  function editarConcepto(c) {
    c = c || { reparto: "fijo", recurrente: true, activo: true, detalle: {} };
    let reparto = c.reparto, leerDetalle = () => ({});
    C.modal("<h3>" + (c.id ? "Editar servicio" : "Nuevo servicio") + '</h3><form class="pila"><div class="campos">' +
      '<label class="campo ancho"><span>Nombre</span><input name="nombre" required value="' + esc(c.nombre || "") + '" placeholder="Cuota de administración"></label></div>' +
      '<div class="campo"><span>¿Cómo se reparte?</span><div class="opciones" data-rep></div></div>' +
      '<label class="campo" data-mbox><span data-mlbl></span><input name="monto" type="number" min="0" step="100" value="' + (Number(c.monto) || "") + '"></label><div data-det></div>' +
      '<div class="fila"><label class="check"><input type="checkbox" name="recurrente" ' + (c.recurrente ? "checked" : "") + '> Se cobra cada mes</label><label class="check"><input type="checkbox" name="activo" ' + (c.activo ? "checked" : "") + "> Activo</label></div>" +
      '<div class="fila-btns"><button class="btn primario" type="submit">Guardar servicio</button></div></form>',
      (m, cerrar) => {
        const cambiar = (r) => {
          reparto = r;
          m.querySelector("[data-mbox]").hidden = r === "manual";
          m.querySelector("[data-mlbl]").textContent = REPARTOS[r][2];
          leerDetalle = editorDetalle(m.querySelector("[data-det]"), r, r === c.reparto ? c.detalle : {});
        };
        opcionesReparto(m.querySelector("[data-rep]"), reparto, cambiar);
        cambiar(reparto);
        m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const f = ev.currentTarget;
          const d = { id: c.id, nombre: f.nombre.value, monto: f.monto.value, reparto, detalle: leerDetalle(), recurrente: f.recurrente.checked, activo: f.activo.checked };
          const r = await C.accion(ev.submitter, () => C.llamar("adm_concepto_guardar", d), "Servicio guardado");
          if (r) { cerrar(); cargarConceptos(); }
        };
      }, true);
  }
  $("#s-nuevo").addEventListener("click", async () => { try { await datosCasas(E.casasPeriodo || PER); } catch (e) { return err(e); } editarConcepto(null); });
  $("#s-lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-s]"); if (!b) return;
    const c = E.conceptos.find((x) => x.id === b.closest("[data-con]").dataset.con);
    if (b.dataset.s === "editar") editarConcepto(c);
    if (b.dataset.s === "cobrar") { irA("cobros"); setTimeout(() => { $("#g-concepto").value = c.id; $("#g-concepto").dispatchEvent(new Event("change")); $("#f-generar").scrollIntoView({ behavior: "smooth" }); }, 250); }
    if (b.dataset.s === "borrar") {
      if (!(await C.confirmar("Se borra el servicio " + c.nombre + ". Los cobros ya creados se conservan.", "Borrar", true))) return;
      const r = await C.accion(b, () => C.llamar("adm_concepto_borrar", { id: c.id }), "Servicio borrado");
      if (r) cargarConceptos();
    }
  });
  const PLANTILLAS = [
    { nombre: "Cuota de administración", reparto: "fijo", recurrente: true, d: "Todas pagan igual" },
    { nombre: "Administración por coeficiente", reparto: "coeficiente", recurrente: true, d: "Según tamaño de la unidad" },
    { nombre: "Parqueadero", reparto: "seleccion", recurrente: true, detalle: { cada: true }, d: "Solo quienes tienen carro" },
    { nombre: "Agua / consumo", reparto: "manual", recurrente: false, d: "Valor según lectura" },
    { nombre: "Cuota extraordinaria", reparto: "igual", recurrente: false, d: "Un arreglo dividido entre todos" },
    { nombre: "Seguro de áreas comunes", reparto: "coeficiente", recurrente: true, d: "Póliza anual o mensual" },
    { nombre: "Alquiler salón social", reparto: "seleccion", recurrente: false, detalle: { cada: true }, d: "A quien lo alquiló" },
    { nombre: "Tarjeta / control de acceso", reparto: "seleccion", recurrente: false, detalle: { cada: true }, d: "Reposición" },
  ];
  $("#s-plantillas").innerHTML = PLANTILLAS.map((p, i) => '<button class="opcion" type="button" data-pl="' + i + '">' + esc(p.nombre) + "<small>" + esc(REPARTOS[p.reparto][0] + " · " + p.d) + "</small></button>").join("");
  $("#s-plantillas").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pl]"); if (!b) return;
    try { await datosCasas(E.casasPeriodo || PER); } catch (er) { return err(er); }
    const p = PLANTILLAS[Number(b.dataset.pl)];
    editarConcepto({ nombre: p.nombre, reparto: p.reparto, recurrente: p.recurrente, activo: true, detalle: p.detalle || {} });
  });

  // ===================================================================== COBROS
  let repartoG = "fijo", detalleG = {}, leerDetalleG = () => ({});
  function pintarRepartoG() {
    opcionesReparto($("#g-reparto"), repartoG, (r) => { repartoG = r; detalleG = {}; pintarRepartoG(); });
    $("#g-monto-box").hidden = repartoG === "manual";
    $("#g-monto-lbl").textContent = REPARTOS[repartoG][2];
    leerDetalleG = editorDetalle($("#g-detalle"), repartoG, detalleG);
  }
  $("#g-concepto").addEventListener("change", () => {
    const c = E.conceptos.find((x) => x.id === $("#g-concepto").value);
    if (c) {
      $("#g-nombre").value = c.nombre;
      $("#f-generar").monto.value = Number(c.monto) || "";
      repartoG = c.reparto; detalleG = c.detalle || {};
    } else { detalleG = {}; }
    pintarRepartoG();
  });
  function datosGenerar() {
    const f = $("#f-generar");
    return { concepto_id: f.concepto_id.value || null, nombre: f.nombre.value, periodo: f.periodo.value, vence: f.vence.value, monto: f.monto.value, reparto: repartoG, detalle: leerDetalleG() };
  }
  async function previaGenerar(boton) {
    const d = datosGenerar();
    const r = await C.accion(boton, () => C.llamar("adm_generar", Object.assign({ preview: true }, d)));
    if (!r) return;
    C.modal("<h3>Revisar: " + esc(r.nombre) + '</h3><p class="muted">' + C.nombrePeriodo(r.periodo) + " · vence " + C.fecha(r.vence) + " · " + r.filas.length + " casas · total <b>" + din(r.total) + "</b>" +
      (r.omitidas ? "<br>" + r.omitidas + " casas ya tenían este cobro en el mes y se omiten." : "") + '</p><div class="tabla-wrap" style="max-height:340px"><table><thead><tr><th>Casa</th><th class="num">Valor</th></tr></thead><tbody>' +
      (r.filas.map((x) => "<tr><td>" + esc(x.codigo) + '</td><td class="num">' + din(x.monto) + "</td></tr>").join("") || '<tr><td colspan="2" class="vacio">Nada por crear</td></tr>') +
      '</tbody></table></div><div class="fila-btns"><button class="btn ghost" data-no type="button">Corregir</button>' + (r.filas.length ? '<button class="btn primario" data-si type="button">Confirmar y generar</button>' : "") + "</div>",
      (m, cerrar) => {
        m.querySelector("[data-no]").onclick = cerrar;
        const si = m.querySelector("[data-si]");
        if (si) si.onclick = async () => {
          const x = await C.accion(si, () => C.llamar("adm_generar", d));
          if (x) { cerrar(); C.aviso(x.creados + " cobros creados por " + din(x.total), "ok"); E.casasPeriodo = null; cargarCobros(); }
        };
      });
  }
  $("#g-previa").addEventListener("click", (e) => previaGenerar(e.currentTarget));
  $("#f-generar").addEventListener("submit", (e) => { e.preventDefault(); previaGenerar(e.submitter); });

  $("#gm-btn").addEventListener("click", async (e) => {
    const d = { periodo: $("#gm-periodo").value, vence: $("#gm-vence").value };
    const r = await C.accion(e.currentTarget, () => C.llamar("adm_generar_mes", Object.assign({ preview: true }, d)));
    if (!r) return;
    const total = r.resultado.reduce((a, x) => a + (x.total || 0), 0);
    C.modal("<h3>Servicios de " + C.nombrePeriodo(r.periodo) + '</h3><div class="lista corta">' + r.resultado.map((x) => '<div class="item"><div class="principal"><b>' + esc(x.nombre) + "</b><small>" +
      (x.error ? esc(x.error) : x.casas + " casas" + (x.omitidas ? " · " + x.omitidas + " ya creadas" : "")) + "</small></div>" + (x.error ? '<span class="chip mal">Revisar</span>' : '<span class="monto">' + din(x.total) + "</span>") + "</div>").join("") +
      '</div><p class="muted">Total a cobrar: <b>' + din(total) + '</b></p><div class="fila-btns"><button class="btn ghost" data-no type="button">Cancelar</button><button class="btn primario" data-si type="button">Generar todo</button></div>',
      (m, cerrar) => {
        m.querySelector("[data-no]").onclick = cerrar;
        m.querySelector("[data-si]").onclick = async (ev) => {
          const x = await C.accion(ev.currentTarget, () => C.llamar("adm_generar_mes", d));
          if (!x) return;
          cerrar();
          C.aviso("Listo: " + x.resultado.reduce((a, y) => a + (y.casas || 0), 0) + " cobros creados", "ok");
          E.casasPeriodo = null; cargarCobros();
        };
      });
  });

  $("#mora-btn").addEventListener("click", async (e) => {
    const periodo = $("#gm-periodo").value;
    const r = await C.accion(e.currentTarget, () => C.llamar("adm_aplicar_mora", { periodo, preview: true }));
    if (!r) return;
    if (!r.casas) return C.aviso("No hay deudas vencidas para aplicar mora (o ya se aplicó este mes)", "info");
    if (!(await C.confirmar("Se cobrará interés de mora a " + r.casas + " casas por un total de " + din(r.total) + " en " + C.nombrePeriodo(periodo) + ".", "Aplicar mora"))) return;
    const x = await C.accion(e.currentTarget, () => C.llamar("adm_aplicar_mora", { periodo }), "Intereses de mora aplicados");
    if (x) { E.casasPeriodo = null; cargarCobros(); }
  });

  async function cargarCobrosTab() {
    try { await datosConceptos(); } catch (e) { return err(e); }
    if (!$("#g-reparto").children.length) pintarRepartoG();
    cargarCobros();
  }
  async function cargarCobros() {
    try {
      await datosCasas(E.casasPeriodo || PER);
      E.cobros = await C.llamar("adm_cobros", { periodo: $("#c-periodo").value || null });
    } catch (e) { return err(e); }
    pintarCobros();
  }
  function cobrosFiltrados() {
    let l = C.buscar(E.cobros, $("#c-buscar").value, (x) => { const c = casaPorId(x.casa_id); return [c.codigo, c.propietario, x.descripcion, x.periodo]; });
    const est = $("#c-estado").value, con = $("#c-concepto").value;
    if (con) l = l.filter((x) => x.concepto_id === con);
    if (est === "pagado") l = l.filter((x) => Number(x.pagado) >= Number(x.monto));
    if (est === "abonado") l = l.filter((x) => Number(x.pagado) > 0 && Number(x.pagado) < Number(x.monto));
    if (est === "pendiente") l = l.filter((x) => Number(x.pagado) < Number(x.monto));
    if (est === "vencido") l = l.filter((x) => Number(x.pagado) < Number(x.monto) && x.vence && x.vence < C.hoy());
    return l;
  }
  function pintarCobros() {
    const l = cobrosFiltrados();
    const tot = l.reduce((a, x) => a + Number(x.monto), 0), pag = l.reduce((a, x) => a + Number(x.pagado), 0);
    $("#c-conteo").textContent = l.length + " cobros · " + din(pag) + " de " + din(tot);
    $("#c-tabla").innerHTML = l.length ? l.slice(0, 800).map((x) => {
      const c = casaPorId(x.casa_id);
      return '<tr data-cobro="' + x.id + '"><td><b>' + esc(c.codigo) + "</b></td><td>" + esc(x.descripcion) + "</td><td>" + C.mesCorto(x.periodo) + "</td><td>" + C.fecha(x.vence) + '</td><td class="num">' + din(x.monto) + '</td><td class="num">' + din(x.pagado) + "</td><td>" + C.estadoCobro(x) +
        '</td><td><button class="btn mini" data-c="editar" type="button">Editar</button> ' + (Number(x.pagado) > 0 ? "" : '<button class="btn mini peligro" data-c="borrar" type="button">Borrar</button>') + "</td></tr>";
    }).join("") + (l.length > 800 ? '<tr><td colspan="8" class="muted">Mostrando 800 de ' + l.length + ". Usa el buscador para afinar.</td></tr>" : "") : '<tr><td colspan="8" class="vacio">Sin cobros con ese filtro.</td></tr>';
  }
  $("#c-buscar").addEventListener("input", C.debounce(pintarCobros));
  ["#c-estado", "#c-concepto"].forEach((s) => $(s).addEventListener("change", pintarCobros));
  $("#c-periodo").addEventListener("change", cargarCobros);
  $("#c-csv").addEventListener("click", () => C.csv("cobros-" + ($("#c-periodo").value || "todos"), [["Casa", "Propietario", "Servicio", "Mes", "Vence", "Valor", "Pagado", "Pendiente"],
    ...cobrosFiltrados().map((x) => { const c = casaPorId(x.casa_id); return [c.codigo, c.propietario, x.descripcion, x.periodo, x.vence, x.monto, x.pagado, Number(x.monto) - Number(x.pagado)]; })]));
  $("#c-tabla").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-c]"); if (!b) return;
    const x = E.cobros.find((y) => y.id === b.closest("[data-cobro]").dataset.cobro);
    if (b.dataset.c === "borrar") {
      if (!(await C.confirmar("Se borra el cobro " + x.descripcion + " de " + casaPorId(x.casa_id).codigo + ".", "Borrar", true))) return;
      const r = await C.accion(b, () => C.llamar("adm_cobro_borrar", { id: x.id }), "Cobro borrado");
      if (r) cargarCobros();
      return;
    }
    C.modal("<h3>Editar cobro · " + esc(casaPorId(x.casa_id).codigo) + '</h3><form class="pila"><div class="campos">' +
      '<label class="campo ancho"><span>Descripción</span><input name="descripcion" value="' + esc(x.descripcion) + '"></label>' +
      '<label class="campo"><span>Valor (mínimo ' + din(x.pagado) + ')</span><input name="monto" type="number" min="' + Number(x.pagado) + '" value="' + Number(x.monto) + '"></label>' +
      '<label class="campo"><span>Vence</span><input name="vence" type="date" value="' + esc(x.vence || "") + '"></label></div>' +
      '<p class="muted">Para un descuento, baja el valor. Para condonar, ponlo igual a lo pagado.</p><div class="fila-btns"><button class="btn primario" type="submit">Guardar</button></div></form>',
      (m, cerrar) => m.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        const r = await C.accion(ev.submitter, () => C.llamar("adm_cobro_editar", Object.assign({ id: x.id }, Object.fromEntries(new FormData(ev.currentTarget)))), "Cobro actualizado");
        if (r) { cerrar(); cargarCobros(); }
      });
  });

  // ===================================================================== CAJA
  const CATEGORIAS = ["Vigilancia", "Aseo", "Mantenimiento", "Reparaciones", "Servicios públicos", "Jardinería", "Honorarios", "Seguros", "Papelería", "Alquiler salón", "Multas", "Intereses bancarios", "Otros"];
  async function cargarMovs() {
    try { E.movs = await C.llamar("adm_movs", { desde: $("#m-desde").value, hasta: $("#m-hasta").value }); } catch (e) { return err(e); }
    const cats = [...new Set(E.movs.map((m) => m.categoria))].sort();
    const sel = $("#m-cat"), prev = sel.value;
    sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map((c) => '<option value="' + esc(c) + '">' + esc(c) + "</option>").join("");
    sel.value = cats.includes(prev) ? prev : "";
    pintarMovs();
  }
  function movsFiltrados() {
    let l = C.buscar(E.movs, $("#m-buscar").value, (m) => [m.concepto, m.proveedor, m.categoria, m.nota, m.monto]);
    if ($("#m-tipo").value) l = l.filter((m) => m.tipo === $("#m-tipo").value);
    if ($("#m-cat").value) l = l.filter((m) => m.categoria === $("#m-cat").value);
    return l;
  }
  function pintarMovs() {
    const l = movsFiltrados();
    const ing = l.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + Number(m.monto), 0);
    const egr = l.filter((m) => m.tipo === "egreso").reduce((a, m) => a + Number(m.monto), 0);
    $("#m-kpis").innerHTML = '<div class="kpi ok"><span>Otros ingresos</span><b>' + din(ing) + '</b></div><div class="kpi mal"><span>Gastos</span><b>' + din(egr) + '</b></div><div class="kpi ' + (ing - egr >= 0 ? "ok" : "mal") + '"><span>Diferencia</span><b>' + din(ing - egr) + '</b><small>sin contar cuotas recaudadas</small></div>';
    $("#m-conteo").textContent = l.length + " movimientos";
    $("#m-lista").innerHTML = l.length ? l.map((m) => '<div class="item" data-mov="' + m.id + '"><div class="principal"><b>' + esc(m.concepto) + "</b><small>" + esc([C.fecha(m.fecha), m.categoria, m.proveedor, m.nota].filter(Boolean).join(" · ")) + "</small></div>" +
      '<span class="chip ' + (m.tipo === "ingreso" ? "ok" : "mal") + '">' + (m.tipo === "ingreso" ? "Ingreso" : "Gasto") + '</span><span class="monto">' + (m.tipo === "egreso" ? "-" : "") + din(m.monto) + "</span>" +
      '<div class="acc"><button class="btn mini" data-m="editar" type="button">Editar</button><button class="btn mini peligro" data-m="borrar" type="button">Borrar</button></div></div>').join("") : '<p class="vacio">Sin movimientos en este rango.</p>';
  }
  $("#m-buscar").addEventListener("input", C.debounce(pintarMovs));
  ["#m-tipo", "#m-cat"].forEach((s) => $(s).addEventListener("change", pintarMovs));
  ["#m-desde", "#m-hasta"].forEach((s) => $(s).addEventListener("change", cargarMovs));
  $("#m-csv").addEventListener("click", () => C.csv("caja", [["Fecha", "Tipo", "Categoría", "Concepto", "Proveedor", "Valor", "Nota"], ...movsFiltrados().map((m) => [m.fecha, m.tipo, m.categoria, m.concepto, m.proveedor, m.monto, m.nota])]));
  function editarMov(m) {
    m = m || { tipo: "egreso", fecha: C.hoy() };
    let tipo = m.tipo;
    C.modal("<h3>" + (m.id ? "Editar movimiento" : "Registrar movimiento") + '</h3><form class="pila"><div class="opciones" data-tipo><button class="opcion" type="button" data-t="egreso">Gasto<small>Sale dinero</small></button><button class="opcion" type="button" data-t="ingreso">Otro ingreso<small>Entra dinero (no cuotas)</small></button></div><div class="campos">' +
      '<label class="campo"><span>Categoría</span><input name="categoria" list="cats" value="' + esc(m.categoria || "") + '" placeholder="Vigilancia"></label>' +
      '<label class="campo"><span>Concepto</span><input name="concepto" required value="' + esc(m.concepto || "") + '" placeholder="Pago empresa de vigilancia"></label>' +
      '<label class="campo"><span>Valor</span><input name="monto" type="number" min="1" required value="' + (Number(m.monto) || "") + '"></label>' +
      '<label class="campo"><span>Fecha</span><input name="fecha" type="date" value="' + esc(m.fecha) + '"></label>' +
      '<label class="campo"><span>Proveedor / quién</span><input name="proveedor" value="' + esc(m.proveedor || "") + '"></label>' +
      '<label class="campo"><span>Nota</span><input name="nota" value="' + esc(m.nota || "") + '"></label></div>' +
      '<datalist id="cats">' + CATEGORIAS.map((c) => '<option value="' + c + '">').join("") + '</datalist><div class="fila-btns"><button class="btn primario" type="submit">Guardar</button></div></form>',
      (md, cerrar) => {
        const pintarT = () => $$("[data-t]", md).forEach((b) => b.classList.toggle("on", b.dataset.t === tipo));
        $("[data-tipo]", md).onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) { tipo = b.dataset.t; pintarT(); } };
        pintarT();
        md.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const d = Object.assign({ id: m.id, tipo }, Object.fromEntries(new FormData(ev.currentTarget)));
          const r = await C.accion(ev.submitter, () => C.llamar("adm_mov_guardar", d), "Movimiento guardado");
          if (r) { cerrar(); cargarMovs(); }
        };
      });
  }
  $("#m-nuevo").addEventListener("click", () => editarMov(null));
  $("#m-lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    const m = E.movs.find((x) => x.id === b.closest("[data-mov]").dataset.mov);
    if (b.dataset.m === "editar") return editarMov(m);
    if (!(await C.confirmar("Se borra " + m.concepto + " (" + din(m.monto) + ").", "Borrar", true))) return;
    const r = await C.accion(b, () => C.llamar("adm_mov_borrar", { id: m.id }), "Borrado");
    if (r) cargarMovs();
  });

  // ===================================================================== PORTERÍA
  let vistaPort = "visitas";
  async function cargarPorteria() {
    try {
      await datosCasas(E.casasPeriodo || PER);
      E.porteria = await C.llamar("adm_porteria", { desde: $("#v-desde").value, hasta: $("#v-hasta").value });
    } catch (e) { return err(e); }
    opcionesEstadoPort();
    pintarPorteria();
  }
  function opcionesEstadoPort() {
    const ops = vistaPort === "visitas"
      ? [["", "Todos los estados"], ["por_autorizar", "Esperando respuesta"], ["esperado", "Autorizado"], ["adentro", "Adentro"], ["salio", "Salió"], ["rechazado", "No autorizado"], ["cancelado", "Cancelado"]]
      : [["", "Todos"], ["pendiente", "Sin entregar"], ["entregado", "Entregados"]];
    $("#v-estado").innerHTML = ops.map(([v, t]) => '<option value="' + v + '">' + t + "</option>").join("");
  }
  function porteriaFiltrada() {
    const est = $("#v-estado").value;
    if (vistaPort === "visitas") {
      let l = C.buscar(E.porteria.visitas, $("#v-buscar").value, (v) => { const c = casaPorId(v.casa_id); return [v.nombre, v.documento, v.placa, v.tipo, c.codigo, c.propietario, v.nota]; });
      if (est) l = l.filter((v) => v.estado === est);
      return l;
    }
    let l = C.buscar(E.porteria.paquetes, $("#v-buscar").value, (p) => { const c = casaPorId(p.casa_id); return [p.descripcion, p.empresa, p.entregado_a, c.codigo, c.propietario]; });
    if (est === "pendiente") l = l.filter((p) => !p.entregado_at);
    if (est === "entregado") l = l.filter((p) => p.entregado_at);
    return l;
  }
  function pintarPorteria() {
    const l = porteriaFiltrada();
    $("#v-conteo").textContent = l.length + " registros";
    $("#v-lista").innerHTML = l.length ? l.map((x) => {
      const c = casaPorId(x.casa_id);
      if (vistaPort === "visitas") return '<div class="item"><div class="principal"><b>' + esc(x.nombre) + " → " + esc(c.codigo) + "</b><small>" +
        esc([C.TIPOS_VISITA[x.tipo] || x.tipo, C.fecha(x.fecha) + (x.hasta ? " al " + C.fecha(x.hasta) : ""), x.documento ? "Doc " + x.documento : "", x.placa ? "Placa " + x.placa : "",
          x.ingreso_at ? "Entró " + C.hora(x.ingreso_at) : "", x.salida_at ? "Salió " + C.hora(x.salida_at) : "", x.creada_por === "guardia" ? "anunciado por portería" : "autorizado por la casa"].filter(Boolean).join(" · ")) + "</small></div>" + C.chipVisita(x.estado) + "</div>";
      return '<div class="item"><div class="principal"><b>' + esc(x.descripcion) + " → " + esc(c.codigo) + "</b><small>" + esc([x.empresa, "Recibido " + C.fecha(x.recibido_at, true), x.entregado_at ? "Entregado " + C.fecha(x.entregado_at, true) + (x.entregado_a ? " a " + x.entregado_a : "") : ""].filter(Boolean).join(" · ")) +
        '</small></div><span class="chip ' + (x.entregado_at ? "ok" : "warn") + '">' + (x.entregado_at ? "Entregado" : "En portería") + "</span></div>";
    }).join("") : '<p class="vacio">Sin registros en este rango.</p>';
  }
  $("#v-vista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    $$("#v-vista button").forEach((x) => x.classList.toggle("on", x === b));
    vistaPort = b.dataset.v; opcionesEstadoPort(); pintarPorteria();
  });
  $("#v-buscar").addEventListener("input", C.debounce(pintarPorteria));
  $("#v-estado").addEventListener("change", pintarPorteria);
  ["#v-desde", "#v-hasta"].forEach((s) => $(s).addEventListener("change", cargarPorteria));
  $("#v-csv").addEventListener("click", () => {
    const l = porteriaFiltrada();
    if (vistaPort === "visitas") C.csv("visitas", [["Fecha", "Casa", "Visitante", "Tipo", "Documento", "Placa", "Estado", "Ingreso", "Salida"], ...l.map((v) => [v.fecha, casaPorId(v.casa_id).codigo, v.nombre, v.tipo, v.documento, v.placa, v.estado, v.ingreso_at, v.salida_at])]);
    else C.csv("paquetes", [["Recibido", "Casa", "Descripción", "Empresa", "Entregado", "Entregado a"], ...l.map((p) => [p.recibido_at, casaPorId(p.casa_id).codigo, p.descripcion, p.empresa, p.entregado_at, p.entregado_a])]);
  });

  // ===================================================================== COMUNICADOS
  async function cargarComunicados() {
    try { E.comunicados = await C.llamar("adm_comunicados"); } catch (e) { return err(e); }
    pintarComunicados();
  }
  function pintarComunicados() {
    const l = C.buscar(E.comunicados, $("#o-buscar").value, (c) => [c.titulo, c.cuerpo]);
    $("#o-conteo").textContent = l.length + " comunicados";
    $("#o-lista").innerHTML = l.length ? l.map((c) => '<div class="item' + (c.importante ? " alerta" : "") + '" data-com="' + c.id + '"><div class="principal"><b>' + esc(c.titulo) + "</b><small>" + C.fecha(c.creado_at, true) + "<br>" + esc(c.cuerpo.slice(0, 180)) + (c.cuerpo.length > 180 ? "…" : "") + "</small></div>" +
      '<div class="acc"><button class="btn mini" data-o="editar" type="button">Editar</button><button class="btn mini peligro" data-o="borrar" type="button">Borrar</button></div></div>').join("") : '<p class="vacio">Sin comunicados.</p>';
  }
  $("#o-buscar").addEventListener("input", C.debounce(pintarComunicados));
  $("#f-com").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const d = { id: f.id.value || null, titulo: f.titulo.value, cuerpo: f.cuerpo.value, importante: f.importante.checked };
    const r = await C.accion(e.submitter, () => C.llamar("adm_comunicado_guardar", d), d.id ? "Comunicado actualizado" : "Comunicado publicado");
    if (r) { f.reset(); f.id.value = ""; cargarComunicados(); }
  });
  $("#o-lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-o]"); if (!b) return;
    const c = E.comunicados.find((x) => x.id === b.closest("[data-com]").dataset.com);
    if (b.dataset.o === "editar") {
      const f = $("#f-com");
      f.id.value = c.id; f.titulo.value = c.titulo; f.cuerpo.value = c.cuerpo; f.importante.checked = c.importante;
      f.titulo.focus();
      return;
    }
    if (!(await C.confirmar("Se borra el comunicado " + c.titulo + ".", "Borrar", true))) return;
    const r = await C.accion(b, () => C.llamar("adm_comunicado_borrar", { id: c.id }), "Borrado");
    if (r) cargarComunicados();
  });

  // ===================================================================== USUARIOS
  const ROLES = { admin: "Administración", guardia: "Portería", casa: "Casa" };
  let filtroRol = "";
  async function cargarUsuarios() {
    try { await datosCasas(E.casasPeriodo || PER); E.usuarios = await C.llamar("adm_usuarios"); } catch (e) { return err(e); }
    pintarUsuarios();
  }
  function pintarUsuarios() {
    let l = C.buscar(E.usuarios, $("#u-buscar").value, (u) => [u.usuario, u.nombre, u.casa, ROLES[u.rol]]);
    if (filtroRol === "bloqueado") l = l.filter((u) => u.estado === "bloqueado");
    else if (filtroRol) l = l.filter((u) => u.rol === filtroRol);
    $("#u-conteo").textContent = l.length + " usuarios";
    $("#u-lista").innerHTML = l.length ? l.map((u) => '<div class="item" data-us="' + u.id + '"><div class="principal"><b>' + esc(u.usuario) + (u.yo ? ' <span class="chip info">Tú</span>' : "") + "</b><small>" +
      esc([u.nombre, u.casa ? "Casa " + u.casa : "", u.ultimo_acceso ? "Último acceso " + C.fecha(u.ultimo_acceso, true) : "Nunca ha entrado"].filter(Boolean).join(" · ")) + "</small></div>" +
      '<span class="chip ' + (u.rol === "admin" ? "info" : u.rol === "guardia" ? "warn" : "") + '">' + ROLES[u.rol] + "</span>" + (u.estado === "bloqueado" ? '<span class="chip mal">Bloqueado</span>' : "") +
      '<div class="acc"><button class="btn mini" data-u="editar" type="button">Editar / clave</button>' + (u.yo ? "" : '<button class="btn mini" data-u="estado" type="button">' + (u.estado === "bloqueado" ? "Desbloquear" : "Bloquear") + '</button><button class="btn mini peligro" data-u="borrar" type="button">Borrar</button>') + "</div></div>").join("") : '<p class="vacio">Sin usuarios con ese filtro.</p>';
  }
  $("#u-buscar").addEventListener("input", C.debounce(pintarUsuarios));
  $("#u-roles").addEventListener("click", (e) => {
    const b = e.target.closest("[data-r]"); if (!b) return;
    $$("#u-roles button").forEach((x) => x.classList.toggle("on", x === b));
    filtroRol = b.dataset.r; pintarUsuarios();
  });
  function editarUsuario(u) {
    const nuevo = !u;
    u = u || { rol: "guardia" };
    let rol = u.rol;
    C.modal("<h3>" + (nuevo ? "Nuevo usuario" : "Editar " + esc(u.usuario)) + '</h3><form class="pila"><div class="opciones" data-rol>' +
      Object.entries(ROLES).map(([k, v]) => '<button class="opcion" type="button" data-r="' + k + '">' + v + "</button>").join("") + '</div><div class="campos">' +
      '<label class="campo"><span>Usuario</span><input name="usuario" autocapitalize="none" ' + (nuevo ? "required" : "") + ' value="' + esc(u.usuario || "") + '"></label>' +
      '<label class="campo"><span>' + (nuevo ? "Clave" : "Nueva clave (vacío = no cambia)") + '</span><input name="clave" ' + (nuevo ? "required" : "") + ' minlength="4"></label>' +
      '<label class="campo ancho"><span>Nombre</span><input name="nombre" value="' + esc(u.nombre || "") + '" placeholder="Portería turno noche"></label></div>' +
      '<div class="campo" data-casabox><span>Casa</span><div data-casa></div></div><div class="fila-btns"><button class="btn primario" type="submit">Guardar</button></div></form>',
      (m, cerrar) => {
        const selCasa = selectorCasa(m.querySelector("[data-casa]"), u.casa_id);
        const pintarR = () => { $$("[data-r]", m).forEach((b) => b.classList.toggle("on", b.dataset.r === rol)); m.querySelector("[data-casabox]").hidden = rol !== "casa"; };
        m.querySelector("[data-rol]").onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) { rol = b.dataset.r; pintarR(); } };
        pintarR();
        m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const d = Object.assign({ id: u.id, rol, casa_id: selCasa.value }, Object.fromEntries(new FormData(ev.currentTarget)));
          if (rol === "casa" && !d.casa_id) return C.aviso("Elige la casa", "error");
          const r = await C.accion(ev.submitter, () => C.llamar("adm_usuario_guardar", d), "Usuario guardado");
          if (!r) return;
          cerrar(); cargarUsuarios();
          if (d.clave) {
            const url = location.href.replace(/006_admin\.html.*$/, "006_inicio.html");
            const txt = "Acceso a la app del conjunto:\n" + url + "\nUsuario: " + (d.usuario || u.usuario) + "\nClave: " + d.clave;
            C.modal('<h3>Comparte el acceso</h3><p class="muted" style="white-space:pre-line">' + esc(txt) + '</p><div class="fila-btns"><button class="btn" type="button" data-cp>Copiar</button></div>', (mm) => { mm.querySelector("[data-cp]").onclick = () => C.copiar(txt); });
          }
        };
      });
  }
  $("#u-nuevo").addEventListener("click", () => editarUsuario(null));
  $("#u-lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-u]"); if (!b) return;
    const u = E.usuarios.find((x) => x.id === b.closest("[data-us]").dataset.us);
    if (b.dataset.u === "editar") return editarUsuario(u);
    if (b.dataset.u === "estado") {
      const nuevo = u.estado === "bloqueado" ? "activo" : "bloqueado";
      const r = await C.accion(b, () => C.llamar("adm_usuario_estado", { id: u.id, estado: nuevo }), nuevo === "bloqueado" ? "Usuario bloqueado (se cerró su sesión)" : "Usuario activo");
      if (r) cargarUsuarios();
      return;
    }
    if (!(await C.confirmar("Se borra el usuario " + u.usuario + ".", "Borrar", true))) return;
    const r = await C.accion(b, () => C.llamar("adm_usuario_borrar", { id: u.id }), "Usuario borrado");
    if (r) cargarUsuarios();
  });

  // ===================================================================== AJUSTES
  async function cargarAjustes() {
    let c;
    try { c = await C.llamar("adm_conjunto"); } catch (e) { return err(e); }
    E.conjunto = c;
    const f = $("#f-ajustes");
    ["nombre", "nit", "ciudad", "direccion", "telefono", "dia_vence", "mora_pct", "pago_nequi", "pago_daviplata", "pago_llave", "pago_titular", "pago_banco", "pago_notas", "whatsapp_comprobantes"]
      .forEach((k) => { if (f[k]) f[k].value = c[k] ?? ""; });
    ponerModo(c.comprobante_modo || "whatsapp");
    AJQR.img = c.pago_qr || null; AJQR.cambiado = false;
    pintarQrAjustes();
  }

  const AJQR = { img: null, cambiado: false };
  function pintarQrAjustes() {
    $("#aj-qr-prev").innerHTML = AJQR.img ? '<img src="' + esc(AJQR.img) + '" alt="QR de pago del conjunto">' : '<span class="muted">Sin imagen</span>';
    const f = $("#f-ajustes");
    $("#aj-previa").innerHTML = C.tarjetaPago({
      nequi: f.pago_nequi.value, daviplata: f.pago_daviplata.value, llave: f.pago_llave.value,
      banco: f.pago_banco.value, titular: f.pago_titular.value, notas: f.pago_notas.value, qr: AJQR.img,
    }).replace("El proveedor aún no ha publicado sus datos de pago. Escríbele por WhatsApp.", "Aún no has puesto ningún dato de pago.");
  }
  $("#f-ajustes").addEventListener("input", (e) => { if (/^pago_/.test(e.target.name || "")) pintarQrAjustes(); });
  $("#aj-qr-file").addEventListener("change", (e) => {
    const archivo = e.target.files[0];
    e.target.value = "";
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 560 / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      AJQR.img = cv.toDataURL("image/jpeg", 0.9); AJQR.cambiado = true;
      pintarQrAjustes();
      C.aviso("Imagen lista. Pulsa Guardar ajustes para publicarla.", "info");
    };
    img.onerror = () => { URL.revokeObjectURL(url); C.aviso("No se pudo leer esa imagen", "error"); };
    img.src = url;
  });
  $("#aj-qr-quitar").addEventListener("click", () => { AJQR.img = null; AJQR.cambiado = true; pintarQrAjustes(); });
  function ponerModo(m) {
    $("#f-ajustes").comprobante_modo.value = m;
    $$("#aj-modo [data-m]").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
  }
  $("#aj-modo").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b) ponerModo(b.dataset.m); });
  $("#f-ajustes").addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    if (AJQR.cambiado) datos.pago_qr = AJQR.img || "";
    const r = await C.accion(e.submitter, () => C.llamar("adm_conjunto_guardar", datos), "Ajustes guardados");
    if (r) { cargarAjustes(); $("#t-conjunto").textContent = e.currentTarget.nombre.value; }
  });

  // ===================================================================== MI PLAN
  const SUS = { datos: null, meses: 1 };
  C.enlazarCopiar($("[data-panel=suscripcion]"));

  function diasHasta(f) { return Math.round((new Date(f + "T12:00:00") - new Date(C.hoy() + "T12:00:00")) / 86400e3); }

  async function cargarSuscripcion() {
    let r;
    try { r = await C.llamar("adm_suscripcion"); } catch (e) { return err(e); }
    SUS.datos = r;
    const c = r.conjunto, plan = Number(c.plan_mensual || 0);
    const dias = c.vence ? diasHasta(c.vence) : null;
    const [estTxt, estCls] = c.estado === "suspendido" ? ["Suspendido", "mal"]
      : dias === null ? ["Sin vencimiento", "ok"] : dias < 0 ? ["En gracia", "mal"] : dias <= 7 ? ["Vence pronto", "warn"] : ["Al día", "ok"];
    const pagados = r.pagos.filter((p) => p.estado === "aprobado");
    $("#s-kpis").innerHTML =
      '<div class="kpi ' + estCls + '"><span>Estado</span><b>' + estTxt + "</b><small>" + (dias === null ? "acceso sin fecha límite"
        : dias < 0 ? "se bloquea en " + Math.max(0, r.dias_gracia + dias) + " días" : "quedan " + dias + " días") + "</small></div>" +
      '<div class="kpi"><span>Vence</span><b>' + C.fecha(c.vence) + "</b><small>miembro desde " + C.fecha(String(c.creado_at || "").slice(0, 10)) + "</small></div>" +
      '<div class="kpi"><span>Valor mensual</span><b>' + din(plan) + "</b><small>tarifa de tu plan</small></div>" +
      '<div class="kpi ok"><span>Pagado a la fecha</span><b>' + din(pagados.reduce((a, p) => a + Number(p.monto), 0)) + "</b><small>" +
        pagados.reduce((a, p) => a + Number(p.meses), 0) + " meses confirmados</small></div>";
    $("#s-pago").innerHTML = C.tarjetaPago(r.plataforma, plan * SUS.meses);
    const wa = r.plataforma.whatsapp;
    const soporte = $("#s-soporte");
    soporte.hidden = !wa;
    if (wa) soporte.href = C.whatsapp(wa, "Hola, escribo desde la administración de " + c.nombre + ". Necesito ayuda con: ");
    $("#s-meses").innerHTML = [1, 3, 6, 12].map((m) => '<button class="opcion' + (m === SUS.meses ? " on" : "") + '" type="button" data-m="' + m + '">' +
      m + " " + (m === 1 ? "mes" : "meses") + "<small>" + din(plan * m) + "</small></button>").join("");
    $("#s-total").textContent = din(plan * SUS.meses);
    pintarHistorialSus();
  }

  function pintarHistorialSus() {
    if (!SUS.datos) return;
    const f = $("#s-estado").value;
    let lista = C.buscar(SUS.datos.pagos, $("#s-buscar").value, (p) => [p.referencia, p.nota, p.respuesta]);
    if (f) lista = lista.filter((p) => p.estado === f);
    $("#s-conteo").textContent = lista.length + " de " + SUS.datos.pagos.length;
    $("#s-historial").innerHTML = lista.length ? lista.map((p) => '<div class="item"><div class="principal"><b>' + din(p.monto) + " · " + p.meses + " " +
      (p.meses === 1 ? "mes" : "meses") + "</b><small>Ref: " + esc(p.referencia || "—") + " · " + C.fecha(String(p.creado_at).slice(0, 10)) +
      (p.nota ? "<br>" + esc(p.nota) : "") + (p.respuesta ? "<br>Respuesta: " + esc(p.respuesta) : "") + "</small></div>" + C.chipPago(p.estado) + "</div>").join("")
      : '<p class="vacio">Aún no has reportado pagos de la suscripción.</p>';
  }
  $("#s-buscar").addEventListener("input", C.debounce(pintarHistorialSus));
  $("#s-estado").addEventListener("change", pintarHistorialSus);

  $("#s-meses").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]");
    if (!b || !SUS.datos) return;
    SUS.meses = Number(b.dataset.m);
    $("#f-sus").meses.value = SUS.meses;
    $$("#s-meses .opcion").forEach((x) => x.classList.toggle("on", x === b));
    const total = Number(SUS.datos.conjunto.plan_mensual || 0) * SUS.meses;
    $("#s-total").textContent = din(total);
    $("#s-pago").innerHTML = C.tarjetaPago(SUS.datos.plataforma, total);
  });

  $("#f-sus").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const datos = Object.fromEntries(new FormData(f));
    const r = await C.accion(e.submitter, () => C.llamar("adm_sus_reportar", datos), "Pago reportado");
    if (!r) return;
    f.referencia.value = ""; f.nota.value = "";
    const wa = SUS.datos && SUS.datos.plataforma.whatsapp;
    if (wa) {
      const texto = "Hola, soy la administración de " + SUS.datos.conjunto.nombre + ". Reporté el pago de " + r.meses + " " + (r.meses === 1 ? "mes" : "meses") +
        " de la suscripción por " + din(r.monto) + ". Referencia: " + datos.referencia + ". Te adjunto el comprobante.";
      C.modal('<h3>Envía el comprobante</h3><p class="muted">Tu pago quedó registrado. Envía la foto del comprobante para que lo confirmen más rápido.</p>' +
        '<div class="fila-btns"><a class="btn wa" target="_blank" rel="noopener" href="' + C.whatsapp(wa, texto) + '">Enviar por WhatsApp</a></div>');
    }
    cargarSuscripcion();
  });

  function marcarPlan(c) {
    const b = $("#badge-plan");
    b.hidden = !(c && c.vence && diasHasta(c.vence) <= 7);
  }

  // ===================================================================== navegación
  const CARGAR = {
    resumen: cargarResumen, cobros: cargarCobrosTab, pagos: cargarPagos, casas: cargarCasas, servicios: cargarConceptos,
    caja: cargarMovs, porteria: cargarPorteria, comunicados: cargarComunicados, usuarios: cargarUsuarios, ajustes: cargarAjustes,
    suscripcion: cargarSuscripcion,
  };
  let actual = "resumen";
  function refrescarActual() { if (CARGAR[actual]) CARGAR[actual](); }
  const irA = C.pestanas(document, (id) => { actual = id; refrescarActual(); });

  C.refrescoVivo(async () => { if (CARGAR[actual]) await CARGAR[actual](); }, 60000);

  // Aviso suave cuando llegan pagos nuevos por validar.
  let ultimosPorValidar = null;
  C.cadaTanto(async () => {
    const r = await C.llamar("adm_resumen", { periodo: PER });
    const n = r.metricas.pagos_por_validar;
    const badge = $("#badge-pagos");
    badge.hidden = !n; badge.textContent = n;
    if (ultimosPorValidar !== null && n > ultimosPorValidar) { C.sonar(true); C.aviso("Llegó un pago nuevo para validar", "info"); }
    ultimosPorValidar = n;
  }, 60000);
})();
