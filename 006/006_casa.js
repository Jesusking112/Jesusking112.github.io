(function () {
  "use strict";
  const C = window.Conj, $ = C.$, esc = C.esc, din = C.dinero;
  const yo = C.exigir("casa");
  if (!yo) return;

  $("#t-conjunto").textContent = yo.conjunto || "Conjunto";
  $("#salir").addEventListener("click", C.salir);

  let D = null, visitas = [], tipo = "visita";
  const err = (e) => C.aviso(e.message, "error");

  // ------------------------------------------------------------------ cuenta
  async function cargar() {
    try { D = await C.llamar("casa_inicio"); } catch (e) { return err(e); }
    $("#t-casa").textContent = "Residencia " + D.casa.codigo;
    $("#t-conjunto").textContent = D.conjunto.nombre;
    pintarCuenta();
    pintarAvisos();
  }

  function pintarCuenta() {
    const alDia = D.deuda <= 0;
    $("#saldo").className = "saldo-hero" + (alDia ? " al-dia" : "");
    $("#saldo").innerHTML = '<span class="figura f1" aria-hidden="true"></span><span>' + (alDia ? "Estás al día" : "Total pendiente") + "</span><strong>" + din(D.deuda) + "</strong>" +
      '<p class="muted" style="margin:0 0 14px">' + (D.vencido > 0 ? '<b style="color:var(--mal)">' + din(D.vencido) + " vencido.</b> " : "") +
      (D.por_validar > 0 ? din(D.por_validar) + " en revisión por la administración. " : "") + (Number(D.casa.saldo_favor) > 0 ? "Saldo a favor: " + din(D.casa.saldo_favor) + "." : "") + "</p>" +
      '<div class="fila">' + (alDia ? '<button class="btn" id="paz" type="button">Descargar paz y salvo</button>' : '<button class="btn primario grande" id="pagar" type="button">Pagar / reportar pago</button>') + "</div>";
    const pagar = $("#pagar"); if (pagar) pagar.onclick = abrirPago;
    const paz = $("#paz"); if (paz) paz.onclick = pazYSalvo;

    $("#pendientes").innerHTML = D.pendientes.length ? D.pendientes.map((x) =>
      '<div class="item"><div class="principal"><b>' + esc(x.descripcion) + "</b><small>" + C.nombrePeriodo(x.periodo) + " · vence " + C.fecha(x.vence) + (Number(x.pagado) > 0 ? " · abonado " + din(x.pagado) : "") + "</small></div>" +
      C.estadoCobro(x) + '<span class="monto">' + din(Number(x.monto) - Number(x.pagado)) + "</span></div>").join("") : '<p class="vacio">No tienes cobros pendientes.</p>';
    $("#pagos").innerHTML = D.pagos.length ? D.pagos.map(itemPago).join("") : '<p class="vacio">Aún no has reportado pagos.</p>';
  }
  function itemPago(p) {
    return '<div class="item"><div class="principal"><b>' + din(p.monto) + "</b><small>" + esc([C.fecha(p.creado_at, true), p.metodo, p.referencia ? "Ref " + p.referencia : ""].filter(Boolean).join(" · ")) +
      (p.motivo_rechazo ? "<br>Motivo: " + esc(p.motivo_rechazo) : "") + "</small></div>" + C.chipPago(p.estado) + "</div>";
  }

  function abrirPago() {
    const c = D.conjunto;
    const hayDatos = c.pago_nequi || c.pago_daviplata || c.pago_llave || c.pago_banco || c.pago_titular || c.pago_qr;
    const porWa = !!String(c.whatsapp_comprobantes || "").replace(/\D/g, "");
    const textoDirecto = "Hola, soy de la residencia " + D.casa.codigo + " (" + c.nombre + "). Te envío el comprobante de mi pago" + (D.deuda > 0 ? " por " + din(D.deuda) : "") + ".";
    C.modal('<h3>Pagar mi cuenta</h3><p class="muted" style="margin-top:-4px"><b>Paso 1.</b> Paga en tu app del banco ' + (c.pago_qr ? "escaneando el QR o " : "") + "a cualquiera de estas opciones:</p>" +
      (hayDatos ? C.tarjetaPago({ nequi: c.pago_nequi, daviplata: c.pago_daviplata, llave: c.pago_llave, banco: c.pago_banco, titular: c.pago_titular, notas: c.pago_notas, qr: c.pago_qr }, D.deuda)
        : '<p class="muted">La administración aún no ha puesto sus datos de pago. Pregunta en portería o administración.</p>') +
      (porWa ? '<a class="btn wa grande bloque" style="margin-top:12px" target="_blank" rel="noopener" href="' + C.whatsapp(c.whatsapp_comprobantes, textoDirecto) + '">Enviar comprobante por WhatsApp</a>' +
        '<p class="muted" style="margin:6px 0 0;font-size:.85em">Abre WhatsApp (o WhatsApp Web en el computador) con el mensaje listo; solo adjunta la foto.</p>' : "") +
      '<p class="muted" style="margin:16px 0 8px"><b>Paso 2.</b> Cuéntanos cuánto pagaste' + (porWa ? " y luego envía el comprobante por WhatsApp." : " y el número de la transacción.") + "</p>" +
      '<form class="pila"><div class="campos"><label class="campo"><span>Valor pagado</span><input name="monto" type="number" min="1" required inputmode="numeric" value="' + Math.round(D.deuda) + '"></label>' +
      '<label class="campo"><span>Cómo pagaste</span><select name="metodo"><option value="nequi">Nequi</option><option value="daviplata">Daviplata</option><option value="transferencia">Transferencia</option><option value="llave">Llave / Bre-B</option><option value="consignacion">Consignación</option><option value="efectivo">Efectivo en administración</option></select></label>' +
      '<label class="campo"><span>Número de transacción' + (porWa ? " (opcional)" : "") + '</span><input name="referencia" ' + (porWa ? "" : "required") + '></label>' +
      '<label class="campo"><span>Nota (opcional)</span><input name="nota"></label></div><div class="fila-btns"><button class="btn primario" type="submit">Reportar pago</button></div></form><div data-fin></div>',
      (m, cerrar) => {
        m.addEventListener("click", (e) => { const b = e.target.closest("[data-copiar]"); if (b) C.copiar(b.dataset.copiar); });
        m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const d = Object.fromEntries(new FormData(ev.currentTarget));
          const r = await C.accion(ev.submitter, () => C.llamar("casa_reportar_pago", d), "Pago reportado. La administración lo revisará.");
          if (!r) return;
          ev.currentTarget.hidden = true;
          const texto = "Hola, soy de la residencia " + D.casa.codigo + " (" + D.conjunto.nombre + "). Te envío el comprobante de mi pago por " + din(r.monto) + " por " + r.metodo + (r.referencia ? ", referencia " + r.referencia : "") + ".";
          m.querySelector("[data-fin]").innerHTML = porWa
            ? '<div class="banner info"><span><b>Paso 3.</b> Envía la foto del comprobante. Se abre WhatsApp con el mensaje listo; solo adjunta la imagen.</span></div><a class="btn wa grande bloque" target="_blank" rel="noopener" href="' + C.whatsapp(c.whatsapp_comprobantes, texto) + '">Enviar comprobante por WhatsApp</a>'
            : '<div class="banner info"><span>Listo. Verás el pago como aprobado cuando la administración lo confirme.</span></div><div class="fila-btns"><button class="btn" type="button" data-cerrar>Cerrar</button></div>';
          const bc = m.querySelector("[data-cerrar]"); if (bc) bc.onclick = cerrar;
          cargar();
        };
      });
  }
  $("#historial").addEventListener("click", async (e) => {
    const r = await C.accion(e.currentTarget, () => C.llamar("casa_historial"));
    if (!r) return;
    C.modal('<h3>Historial de mi residencia</h3><div class="buscador"><label class="lupa"><span class="sr-only">Buscar</span><input data-b placeholder="Mes, servicio, referencia…"></label></div><h3>Cobros</h3><div class="tabla-wrap" style="max-height:300px"><table><thead><tr><th>Mes</th><th>Servicio</th><th class="num">Valor</th><th class="num">Pagado</th><th>Estado</th></tr></thead><tbody data-c></tbody></table></div><h3 style="margin-top:16px">Pagos</h3><div class="lista corta" data-p></div>',
      (m) => {
        const pintar = () => {
          const t = m.querySelector("[data-b]").value;
          const cobros = C.buscar(r.cobros, t, (x) => [x.descripcion, C.nombrePeriodo(x.periodo)]);
          const pagos = C.buscar(r.pagos, t, (p) => [p.metodo, p.referencia, p.monto, C.fecha(p.creado_at)]);
          m.querySelector("[data-c]").innerHTML = cobros.map((x) => "<tr><td>" + C.nombrePeriodo(x.periodo) + "</td><td>" + esc(x.descripcion) + '</td><td class="num">' + din(x.monto) + '</td><td class="num">' + din(x.pagado) + "</td><td>" + C.estadoCobro(x) + "</td></tr>").join("") || '<tr><td colspan="5" class="vacio">Sin resultados</td></tr>';
          m.querySelector("[data-p]").innerHTML = pagos.map(itemPago).join("") || '<p class="vacio">Sin resultados</p>';
        };
        pintar();
        m.querySelector("[data-b]").addEventListener("input", C.debounce(pintar));
      }, true);
  });

  function pazYSalvo() {
    const c = D.conjunto;
    const w = window.open("", "_blank");
    if (!w) return C.aviso("Permite las ventanas emergentes para descargar", "error");
    w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Paz y salvo ' + esc(D.casa.codigo) +
      '</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 20px;line-height:1.7;color:#111}h1{font-size:22px;margin:0}small{color:#555}</style></head><body>' +
      "<h1>" + esc(c.nombre) + "</h1><small>" + esc([c.nit ? "NIT " + c.nit : "", c.direccion, c.ciudad].filter(Boolean).join(" · ")) + "</small>" +
      '<h2 style="margin-top:40px">Constancia de paz y salvo</h2><p>Según el sistema de administración de <b>' + esc(c.nombre) + "</b>, la unidad <b>" + esc(D.casa.codigo) + "</b>" +
      (D.casa.propietario ? " (" + esc(D.casa.propietario) + ")" : "") + " no registra saldos pendientes a la fecha de " + C.fecha(C.hoy()) + ".</p><script>window.print()<\/script></body></html>");
    w.document.close();
  }

  // ------------------------------------------------------------------ visitas
  $("#v-tipo").innerHTML = Object.entries(C.TIPOS_VISITA).map(([k, v]) => '<button type="button" class="opcion' + (k === tipo ? " on" : "") + '" data-t="' + k + '">' + v + "</button>").join("");
  $("#v-tipo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    tipo = b.dataset.t;
    C.$$("#v-tipo [data-t]").forEach((x) => x.classList.toggle("on", x === b));
  });
  const fForm = $("#f-visita");
  fForm.fecha.value = C.hoy();
  fForm.fecha.min = C.hoy();
  fForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.assign({ tipo }, Object.fromEntries(new FormData(fForm)));
    const r = await C.accion(e.submitter, () => C.llamar("casa_visita_crear", d), "Visita anunciada. La portería ya la ve.");
    if (r) { fForm.reset(); fForm.fecha.value = C.hoy(); cargarVisitas(); }
  });

  async function cargarVisitas() {
    try { visitas = await C.llamar("casa_visitas"); } catch (e) { return err(e); }
    pintarVisitas();
  }
  function pintarVisitas() {
    const est = $("#v-estado").value, h = C.hoy();
    let l = C.buscar(visitas, $("#v-buscar").value, (v) => [v.nombre, v.documento, v.placa, C.TIPOS_VISITA[v.tipo], v.nota]);
    if (est === "activas") l = l.filter((v) => v.estado === "adentro" || v.estado === "por_autorizar" || (v.estado === "esperado" && (v.hasta || v.fecha) >= h));
    else if (est) l = l.filter((v) => v.estado === est);
    $("#v-conteo").textContent = l.length + " visitas";
    $("#v-lista").innerHTML = l.length ? l.map((v) => '<div class="item" data-vis="' + v.id + '"><div class="principal"><b>' + esc(v.nombre) + "</b><small>" +
      esc([C.TIPOS_VISITA[v.tipo], C.fecha(v.fecha) + (v.hasta ? " al " + C.fecha(v.hasta) : ""), v.placa ? "Placa " + v.placa : "", v.ingreso_at ? "Entró " + C.hora(v.ingreso_at) : "", v.salida_at ? "Salió " + C.hora(v.salida_at) : ""].filter(Boolean).join(" · ")) + "</small></div>" +
      C.chipVisita(v.estado) + (["esperado", "por_autorizar"].includes(v.estado) ? '<div class="acc"><button class="btn mini peligro" data-cancelar type="button">Cancelar</button></div>' : "") + "</div>").join("") : '<p class="vacio">No hay visitas con ese filtro.</p>';
  }
  $("#v-buscar").addEventListener("input", C.debounce(pintarVisitas));
  $("#v-estado").addEventListener("change", pintarVisitas);
  $("#v-lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cancelar]"); if (!b) return;
    const r = await C.accion(b, () => C.llamar("casa_visita_cancelar", { id: b.closest("[data-vis]").dataset.vis }), "Visita cancelada");
    if (r) cargarVisitas();
  });

  // ------------------------------------------------------------------ Mi QR (residentes)
  let residentes = [];
  async function cargarResidentes() {
    try { residentes = await C.llamar("casa_residentes"); } catch (e) { return err(e); }
    $("#r-lista").innerHTML = residentes.length ? residentes.map((r) => '<div class="item" data-res="' + r.id + '"><div class="principal"><b>' + esc(r.nombre) + "</b><small>" +
      esc([r.documento ? "Doc " + r.documento : "", r.placa ? "Placa " + r.placa : "", r.mov_at ? "Último movimiento " + C.fecha(r.mov_at, true) : ""].filter(Boolean).join(" · ")) + "</small></div>" +
      '<span class="chip ' + (r.adentro ? "ok" : "neutro") + '">' + (r.adentro ? "Adentro" : "Afuera") + "</span>" +
      '<div class="acc"><button class="btn primario" data-r="qr" type="button">Mostrar QR</button><button class="btn mini" data-r="editar" type="button">Editar</button><button class="btn mini peligro" data-r="quitar" type="button">Quitar</button></div></div>').join("")
      : '<p class="vacio">Agrega a las personas que viven en la casa para que cada una tenga su QR.</p>';
  }
  function formResidente(r) {
    r = r || {};
    C.modal("<h3>" + (r.id ? "Editar persona" : "Agregar persona de la casa") + '</h3><form class="pila"><div class="campos">' +
      '<label class="campo"><span>Nombre completo</span><input name="nombre" required value="' + esc(r.nombre || "") + '"></label>' +
      '<label class="campo"><span>Documento (opcional)</span><input name="documento" inputmode="numeric" value="' + esc(r.documento || "") + '"></label>' +
      '<label class="campo"><span>Placa de su vehículo (opcional)</span><input name="placa" autocapitalize="characters" value="' + esc(r.placa || "") + '"></label></div>' +
      '<div class="fila-btns"><button class="btn primario" type="submit">Guardar</button></div></form>',
      (m, cerrar) => m.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        const d = Object.assign({ id: r.id }, Object.fromEntries(new FormData(ev.currentTarget)));
        const x = await C.accion(ev.submitter, () => C.llamar("casa_residente_guardar", d), "Guardado");
        if (x) { cerrar(); cargarResidentes(); }
      });
  }
  $("#r-nuevo").addEventListener("click", () => formResidente());
  $("#r-lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-r]"); if (!b) return;
    const r = residentes.find((x) => x.id === b.closest("[data-res]").dataset.res); if (!r) return;
    if (b.dataset.r === "qr") return mostrarQrVivo(r);
    if (b.dataset.r === "editar") return formResidente(r);
    if (await C.confirmar("¿Quitar a " + r.nombre + "? Su QR dejará de funcionar en portería.", "Sí, quitar", true)) {
      const x = await C.accion(b, () => C.llamar("casa_residente_borrar", { id: r.id }), "Persona quitada");
      if (x) cargarResidentes();
    }
  });

  function mostrarQrVivo(r) {
    C.modal('<div class="qr-vivo"><p class="eyebrow">' + esc(D ? D.conjunto.nombre : "") + "</p><h3>" + esc(r.nombre) + '</h3><p class="muted" style="margin:-6px 0 12px">Casa ' + esc(D ? D.casa.codigo : "") + '</p>' +
      '<div class="qr-vivo-caja" data-caja><canvas data-qr aria-label="Código QR de entrada"></canvas><div class="qr-vivo-tapa" data-tapa hidden><b>QR oculto</b><span>Toca aquí para mostrarlo</span></div><span class="qr-vivo-marca" data-marca aria-hidden="true"></span></div>' +
      '<div class="qr-vivo-reloj" data-reloj aria-live="off"></div><div class="barra-prog qr-vivo-barra"><i data-barra></i></div>' +
      '<p class="muted" style="margin:10px 0 0;font-size:.88em">Muéstralo directo desde tu celular. Cambia cada 30 segundos: una captura no sirve.</p></div>',
      (m) => {
        const cv = m.querySelector("[data-qr]"), tapa = m.querySelector("[data-tapa]"), barra = m.querySelector("[data-barra]");
        let vence = 0, pedirT = 0, vivo = true, tick = 0;
        m.addEventListener("contextmenu", (e) => e.preventDefault());
        const pedir = async () => {
          clearTimeout(pedirT);
          if (!vivo || !document.body.contains(m)) return;
          try {
            const x = await C.llamar("casa_residente_qr", { id: r.id });
            C.pases.dibujarQR(cv, x.codigo, 560);
            vence = Date.now() + x.restante;
            pedirT = setTimeout(pedir, x.restante + 300);
          } catch (e) { err(e); pedirT = setTimeout(pedir, 5000); }
        };
        const tapar = () => { tapa.hidden = false; cv.style.visibility = "hidden"; };
        const destapar = () => { if (!tapa.hidden) { tapa.hidden = true; cv.style.visibility = ""; pedir(); } };
        tapa.addEventListener("click", destapar);
        const vis = () => { if (document.visibilityState === "hidden") tapar(); };
        document.addEventListener("visibilitychange", vis);
        window.addEventListener("blur", tapar);
        tick = setInterval(() => {
          if (!document.body.contains(m)) {
            vivo = false; clearInterval(tick); clearTimeout(pedirT);
            document.removeEventListener("visibilitychange", vis); window.removeEventListener("blur", tapar);
            return;
          }
          const ahora = new Date(), falta = Math.max(0, vence - Date.now());
          barra.style.width = Math.round((falta / 30000) * 100) + "%";
          m.querySelector("[data-reloj]").textContent = ahora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " · cambia en " + Math.ceil(falta / 1000) + " s";
          m.querySelector("[data-marca]").textContent = ahora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          m.querySelector("[data-marca]").style.transform = "translate(" + Math.round(Math.sin(ahora / 900) * 60) + "px," + Math.round(Math.cos(ahora / 1300) * 60) + "px)";
        }, 250);
        pedir();
      });
  }

  // ------------------------------------------------------------------ Invitados (pases QR)
  const PLAZOS = [[2, "2 horas"], [6, "6 horas"], [12, "12 horas"], [24, "1 día"], [72, "3 días"], [168, "1 semana"], [0, "Otro"]];
  let tipoP = "visita", desdeModo = "ahora", plazo = 24, pases = [];
  const fP = $("#f-pase");
  $("#p-tipo").innerHTML = Object.entries(C.TIPOS_VISITA).map(([k, v]) => '<button type="button" class="opcion' + (k === tipoP ? " on" : "") + '" data-t="' + k + '">' + v + "</button>").join("");
  $("#p-plazo").innerHTML = PLAZOS.map(([h, t]) => '<button type="button" class="opcion' + (h === plazo ? " on" : "") + '" data-h="' + h + '">' + t + "</button>").join("");
  const elegir = (cont, sel, b) => C.$$(cont + " " + sel).forEach((x) => x.classList.toggle("on", x === b));
  $("#p-tipo").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; tipoP = b.dataset.t; elegir("#p-tipo", "[data-t]", b); });
  $("#p-desde").addEventListener("click", (e) => {
    const b = e.target.closest("[data-d]"); if (!b) return;
    desdeModo = b.dataset.d; elegir("#p-desde", "[data-d]", b);
    const f = $("#p-desde-f"); f.hidden = desdeModo !== "otro"; f.required = desdeModo === "otro";
    if (desdeModo === "otro" && !f.value) { const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0); f.value = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }
    resumen();
  });
  $("#p-plazo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-h]"); if (!b) return;
    plazo = Number(b.dataset.h); elegir("#p-plazo", "[data-h]", b);
    $("#p-plazo-otro").hidden = plazo !== 0; resumen();
  });
  fP.addEventListener("input", resumen);
  function horasElegidas() { return plazo || Math.max(1, Math.round(Number(fP.cant.value || 0) * Number(fP.unidad.value))); }
  function inicioElegido() { return desdeModo === "otro" && fP.desde.value ? new Date(fP.desde.value).getTime() : Date.now(); }
  function resumen() {
    const a = inicioElegido(), b = a + horasElegidas() * 3600e3;
    $("#p-resumen").innerHTML = "<span>El pase valdrá <b>del " + C.pases.fh(a) + "</b> al <b>" + C.pases.fh(b) + "</b>. En ese tiempo puede entrar y salir con el mismo QR.</span>";
  }
  resumen();

  fP.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(fP));
    const horas = horasElegidas();
    if (horas > 744) return C.aviso("El plazo máximo es 31 días", "error");
    const desde = inicioElegido(), hasta = desde + horas * 3600e3;
    const filas = [["Invitado", f.nombre], ["Tipo", C.TIPOS_VISITA[tipoP]], ["Documento", f.documento], ["Placa", f.placa], ["WhatsApp", f.telefono], ["Desde", C.pases.fh(desde)], ["Hasta", C.pases.fh(hasta)], ["Nota", f.nota]].filter((x) => x[1]);
    const ok = await new Promise((listo) => C.modal('<h3>¿Confirmas que llega esta persona?</h3><dl class="datos-pase">' + filas.map((x) => "<dt>" + x[0] + "</dt><dd>" + esc(x[1]) + "</dd>").join("") + '</dl>' +
      '<div class="fila-btns"><button class="btn ghost" type="button" data-no>Corregir</button><button class="btn primario" type="button" data-si>Sí, crear pase</button></div>',
      (m, cerrar) => { m.querySelector("[data-si]").onclick = () => { cerrar(); listo(true); }; m.querySelector("[data-no]").onclick = () => { cerrar(); listo(false); }; }));
    if (!ok) return;
    const d = { nombre: f.nombre, documento: f.documento, placa: f.placa, telefono: f.telefono, nota: f.nota, tipo: tipoP, horas, desde: desdeModo === "otro" ? new Date(desde).toISOString() : "" };
    const v = await C.accion(e.submitter, () => C.llamar("casa_pase_crear", d), "Pase creado");
    if (!v) return;
    fP.reset(); fP.cant.value = 2; resumen();
    mostrarPase(v, true);
    cargarPases();
  });

  function datosTarjeta(v) {
    return {
      codigo: v.pase_codigo, nombre: v.nombre, documento: v.documento, placa: v.placa, tipo: C.TIPOS_VISITA[v.tipo], nota: v.nota,
      desde: v.valido_desde, hasta: v.valido_hasta, casa: D ? D.casa.codigo : "", por: D ? D.casa.propietario || "Casa " + D.casa.codigo : "", conjunto: D ? D.conjunto.nombre : "",
    };
  }
  function mostrarPase(v, nuevo) {
    const cv = C.pases.tarjetaInvitado(datosTarjeta(v));
    const nombreArchivo = "pase-" + String(v.nombre).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
    const tel = String(v.telefono || "").replace(/\D/g, "");
    const texto = "Hola " + v.nombre + ", este es tu pase para entrar a " + (D ? D.conjunto.nombre : "el conjunto") + " (casa " + (D ? D.casa.codigo : "") + ").\n" +
      "Vale del " + C.pases.fh(v.valido_desde) + " al " + C.pases.fh(v.valido_hasta) + ".\nCódigo: " + C.pases.grupos(v.pase_codigo) + "\nMuestra el QR y tu documento en portería.";
    C.modal("<h3>" + (nuevo ? "Pase listo · " : "") + esc(v.nombre) + '</h3><img class="pase-img" alt="Pase QR de ' + esc(v.nombre) + '" src="' + cv.toDataURL("image/png") + '">' +
      '<div class="pila" style="margin-top:12px">' +
      '<button class="btn wa grande bloque" type="button" data-p="wa">' + (tel ? "Enviar por WhatsApp a " + esc(v.telefono) : "Compartir por WhatsApp") + "</button>" +
      '<div class="fila-btns" style="justify-content:stretch"><button class="btn" type="button" data-p="bajar">Descargar imagen</button><button class="btn ghost" type="button" data-p="cerrar">' + (nuevo ? "No enviar, solo guardar" : "Cerrar") + "</button></div>" +
      '<p class="muted" style="margin:0;font-size:.86em" data-p-ayuda>En el celular se abre el menú para elegir WhatsApp con la imagen. En el computador se descarga la imagen y se abre el chat: solo adjúntala.</p></div>',
      (m, cerrar) => m.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-p]"); if (!b) return;
        if (b.dataset.p === "cerrar") { if (nuevo) C.aviso("Pase guardado. La portería ya lo puede escanear.", "ok"); return cerrar(); }
        if (b.dataset.p === "bajar") return C.pases.descargar(cv, nombreArchivo);
        if (await C.pases.compartirImagen(cv, nombreArchivo, texto)) return;
        C.pases.descargar(cv, nombreArchivo);
        window.open(tel ? C.whatsapp(tel, texto) : "https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
      }));
  }

  async function cargarPases() {
    try { pases = (await C.llamar("casa_visitas")).filter((v) => v.pase_codigo); } catch (e) { return err(e); }
    pintarPases();
  }
  function pintarPases() {
    const ahora = Date.now();
    let l = C.buscar(pases, $("#p-buscar").value, (v) => [v.nombre, v.documento, v.placa, v.pase_codigo, v.telefono]);
    if ($("#p-filtro").value === "activos") l = l.filter((v) => v.estado === "adentro" || (v.estado === "esperado" && Date.parse(v.valido_hasta) > ahora));
    $("#p-conteo").textContent = l.length + " pases";
    $("#p-lista").innerHTML = l.length ? l.map((v) => {
      const vencido = v.estado === "esperado" && Date.parse(v.valido_hasta) <= ahora;
      return '<div class="item" data-pase="' + v.id + '"><div class="principal"><b>' + esc(v.nombre) + "</b><small>" +
        esc(["Del " + C.pases.fh(v.valido_desde) + " al " + C.pases.fh(v.valido_hasta), v.placa ? "Placa " + v.placa : "", v.entradas ? "Entró " + v.entradas + (v.entradas === 1 ? " vez" : " veces") : "Aún no ha entrado"].filter(Boolean).join(" · ")) + "</small></div>" +
        (vencido ? '<span class="chip neutro">Vencido</span>' : C.chipVisita(v.estado)) +
        '<div class="acc">' + (!vencido && ["esperado", "adentro"].includes(v.estado) ? '<button class="btn mini primario" data-pp="ver" type="button">Ver / enviar QR</button>' : "") +
        (v.estado === "esperado" && !vencido ? '<button class="btn mini peligro" data-pp="cancelar" type="button">Cancelar</button>' : "") + "</div></div>";
    }).join("") : '<p class="vacio">No hay pases con ese filtro.</p>';
  }
  $("#p-buscar").addEventListener("input", C.debounce(pintarPases));
  $("#p-filtro").addEventListener("change", pintarPases);
  $("#p-lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pp]"); if (!b) return;
    const v = pases.find((x) => x.id === b.closest("[data-pase]").dataset.pase); if (!v) return;
    if (b.dataset.pp === "ver") return mostrarPase(v, false);
    if (await C.confirmar("¿Cancelar el pase de " + v.nombre + "? Su QR dejará de servir.", "Sí, cancelar", true)) {
      const x = await C.accion(b, () => C.llamar("casa_visita_cancelar", { id: v.id }), "Pase cancelado");
      if (x) cargarPases();
    }
  });

  // ------------------------------------------------------------------ avisos
  function pintarAvisos() {
    $("#paquetes").innerHTML = D.paquetes.length ? D.paquetes.map((p) => '<div class="item alerta"><div class="principal"><b>' + esc(p.descripcion) + "</b><small>" + esc([p.empresa, "Llegó " + C.fecha(p.recibido_at, true)].filter(Boolean).join(" · ")) + '</small></div><span class="chip warn">En portería</span></div>').join("") : '<p class="vacio">No tienes paquetes esperando.</p>';
    pintarComunicados();
    const b = $("#badge-av");
    b.hidden = !D.paquetes.length; b.textContent = D.paquetes.length;
  }
  function pintarComunicados() {
    const l = C.buscar(D.comunicados, $("#o-buscar").value, (c) => [c.titulo, c.cuerpo]);
    $("#comunicados").innerHTML = l.length ? l.map((c) => '<div class="item' + (c.importante ? " alerta" : "") + '"><div class="principal"><b>' + esc(c.titulo) + "</b><small>" + C.fecha(c.creado_at, true) + '</small><p style="margin:6px 0 0;white-space:pre-line">' + esc(c.cuerpo) + "</p></div>" + (c.importante ? '<span class="chip warn">Importante</span>' : "") + "</div>").join("") : '<p class="vacio">Sin comunicados.</p>';
  }
  $("#o-buscar").addEventListener("input", C.debounce(pintarComunicados));

  // ------------------------------------------------------------------ portería pregunta "¿lo dejo entrar?" (con pitido)
  let paquetesAntes = null, comunicadoAntes = null;
  function pintarPorAutorizar(lista) {
    const box = $("#por-autorizar");
    const b = $("#badge-vis");
    b.hidden = !lista.length; b.textContent = lista.length;
    if (!lista.length) { box.innerHTML = ""; C.detenerAlarma(); return; }
    C.iniciarAlarma();
    box.innerHTML = lista.map((v) => '<div class="banner warn pulso" data-id="' + v.id + '"><div><b>Portería: llegó ' + esc(v.nombre) + "</b><br><span>" +
      esc([C.TIPOS_VISITA[v.tipo], v.documento ? "Doc " + v.documento : "", v.placa ? "Placa " + v.placa : "", v.nota].filter(Boolean).join(" · ")) + '</span></div><div class="fila"><button class="btn ok" data-r="si" type="button">Dejar entrar</button><button class="btn peligro" data-r="no" type="button">No autorizar</button></div></div>').join("");
  }
  $("#por-autorizar").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-r]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    const r = await C.accion(b, () => C.llamar("casa_responder", { id, autorizar: b.dataset.r === "si" }), b.dataset.r === "si" ? "Autorizado. La portería ya lo sabe." : "No autorizado.");
    if (r) { C.detenerAlarma(); revisar(); cargarVisitas(); }
  });
  async function revisar() {
    const r = await C.llamar("casa_estado");
    pintarPorAutorizar(r.por_autorizar);
    if (paquetesAntes !== null && r.paquetes > paquetesAntes) { C.sonar(true); C.aviso("Te llegó un paquete a portería", "info"); cargar(); }
    if (comunicadoAntes !== null && r.ultimo_comunicado && r.ultimo_comunicado !== comunicadoAntes) { C.sonar(true); C.aviso("Nuevo comunicado de la administración", "info"); cargar(); }
    paquetesAntes = r.paquetes; comunicadoAntes = r.ultimo_comunicado;
  }

  const btnSonido = $("#sonido");
  btnSonido.hidden = C.audioListo();
  btnSonido.addEventListener("click", async () => { await C.activarAudio(); C.sonar(true); btnSonido.hidden = true; });
  document.addEventListener("pointerdown", () => setTimeout(() => { btnSonido.hidden = C.audioListo(); }, 300), { once: true });

  let pestanaCasa = null;
  C.pestanas(document, (id) => {
    pestanaCasa = id;
    if (id === "visitas") cargarVisitas();
    if (id === "miqr") cargarResidentes();
    if (id === "invitados") { resumen(); cargarPases(); }
  });
  C.refrescoVivo(async () => {
    await cargar();
    if (pestanaCasa === "visitas") await cargarVisitas();
    if (pestanaCasa === "miqr") await cargarResidentes();
    if (pestanaCasa === "invitados") await cargarPases();
  }, 60000);
  cargar();
  revisar().catch(() => {});
  C.cadaTanto(revisar, 15000);
})();
