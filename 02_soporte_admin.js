/* Panel de administración del soporte (solo modo 1).
   Dos bandejas (sin revisar / revisados), buscador, chat y respuestas rápidas. */
(function () {
  "use strict";
  const S = window.Soporte;
  const $ = (id) => document.getElementById(id);

  let estadoActual = "sin_revisar";
  let ticketSel = null;   // { id, estado, ... }

  // ---------- Lista ----------
  async function cargarLista() {
    const q = $("q").value.trim();
    setMsg("msgLista", "Cargando...", "");
    const res = await S.api.listar(estadoActual, q);
    if (res && res.error) { setMsg("msgLista", res.error, "error"); return; }
    setMsg("msgLista", "", "");
    pintarLista(res.tickets || []);
  }

  function pintarLista(tickets) {
    const cont = $("lista");
    if (!tickets.length) {
      cont.innerHTML = '<p class="vacio">No hay tickets en esta bandeja.</p>';
      return;
    }
    cont.innerHTML = tickets.map((t) => {
      const rev = t.estado === "revisado";
      const nuevoDelUsuario = t.ultimo_autor === "usuario";
      return '<div class="ticket-item" data-id="' + t.id + '">' +
        '<div style="flex:1;">' +
          '<p class="titulo">' + S.esc(t.asunto || "(sin asunto)") + '</p>' +
          '<div class="meta">Token ' + S.esc(t.token) + ' · ' + S.esc(S.fecha(t.actualizado_en || t.creado_en)) + '</div>' +
        '</div>' +
        '<div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">' +
          '<span class="pill tipo">' + S.esc(t.tipo || "otro") + '</span>' +
          '<span class="pill ' + (rev ? "rev" : "pend") + '">' + (rev ? "Revisado" : "Sin revisar") + '</span>' +
          (nuevoDelUsuario && !rev ? '<span class="pill pend">Nuevo</span>' : '') +
        '</div>' +
        '</div>';
    }).join("");
    cont.querySelectorAll(".ticket-item").forEach((el) =>
      el.addEventListener("click", () => abrirTicket(Number(el.dataset.id))));
  }

  // ---------- Detalle ----------
  async function abrirTicket(id) {
    setMsg("msgDetalle", "Cargando...", "");
    const res = await S.api.verAdmin(id);
    if (res && res.error) { setMsg("msgDetalle", res.error, "error"); return; }
    setMsg("msgDetalle", "", "");
    ticketSel = res.ticket;
    pintarDetalle(res);
    $("vistaLista").classList.add("oculto");
    $("vistaDetalle").classList.remove("oculto");
    $("dRespuesta").value = "";
    window.scrollTo(0, 0);
  }

  function pintarDetalle(res) {
    const t = res.ticket || {};
    $("dAsunto").textContent = t.asunto || "(sin asunto)";
    $("dTipo").textContent = t.tipo || "otro";
    $("dToken").textContent = t.token || "";
    $("dContacto").textContent = t.contacto ? ("Contacto: " + t.contacto) : "";

    const rev = t.estado === "revisado";
    const est = $("dEstado");
    est.textContent = rev ? "Revisado" : "Sin revisar";
    est.className = "pill " + (rev ? "rev" : "pend");
    $("btnToggleEstado").textContent = rev ? "Marcar sin revisar" : "Marcar revisado";

    const chat = $("chat");
    chat.innerHTML = (res.mensajes || []).map((m) => {
      const esUsuario = m.autor === "usuario";
      return '<div class="burbuja ' + (esUsuario ? "soporte" : "usuario") + '">' +
        '<div class="quien">' + (esUsuario ? "Usuario" : "Yo (soporte)") + '</div>' +
        '<div>' + S.esc(m.cuerpo).replace(/\n/g, "<br>") + '</div>' +
        '<div class="cuando">' + S.esc(S.fecha(m.creado_en)) + '</div>' +
        '</div>';
    }).join("");
    chat.scrollTop = chat.scrollHeight;
  }

  function volver() {
    $("vistaDetalle").classList.add("oculto");
    $("vistaLista").classList.remove("oculto");
    ticketSel = null;
    cargarLista();
  }

  async function responder(marcarRevisado) {
    if (!ticketSel) return;
    const cuerpo = $("dRespuesta").value.trim();
    if (!cuerpo) { setMsg("msgDetalle", "Escribe una respuesta.", "error"); return; }
    $("btnResponder").disabled = true;
    $("btnResponderRev").disabled = true;
    setMsg("msgDetalle", "Enviando...", "");
    const res = await S.api.responderAdmin(ticketSel.id, cuerpo, marcarRevisado);
    $("btnResponder").disabled = false;
    $("btnResponderRev").disabled = false;
    if (res && res.error) { setMsg("msgDetalle", res.error, "error"); return; }
    $("dRespuesta").value = "";
    setMsg("msgDetalle", "Respuesta enviada.", "ok");
    await abrirTicket(ticketSel.id); // recarga el hilo y el estado
  }

  async function alternarEstado() {
    if (!ticketSel) return;
    const nuevo = ticketSel.estado === "revisado" ? "sin_revisar" : "revisado";
    const res = await S.api.marcar(ticketSel.id, nuevo);
    if (res && res.error) { setMsg("msgDetalle", res.error, "error"); return; }
    await abrirTicket(ticketSel.id);
  }

  // ---------- Respuestas rápidas ----------
  async function abrirBarra() {
    $("fondoBarra").classList.add("abierta");
    await cargarRapidas();
  }
  function cerrarBarra() { $("fondoBarra").classList.remove("abierta"); }

  async function cargarRapidas() {
    const res = await S.api.listarRapidas();
    const cont = $("listaRapidas");
    if (res && res.error) { cont.innerHTML = '<p class="vacio">' + S.esc(res.error) + '</p>'; return; }
    const lista = res.rapidas || [];
    if (!lista.length) { cont.innerHTML = '<p class="vacio">No tienes respuestas rápidas todavía.</p>'; return; }
    cont.innerHTML = lista.map((r) =>
      '<div class="rapida" data-id="' + r.id + '">' +
        '<span class="txt">' + S.esc(r.texto) + '</span>' +
        '<button class="del" data-del="' + r.id + '">Borrar</button>' +
      '</div>').join("");

    // Clic en el texto = insertar en la respuesta; clic en Borrar = eliminar.
    cont.querySelectorAll(".rapida").forEach((el) => {
      el.querySelector(".txt").addEventListener("click", () => {
        insertarRapida(el.querySelector(".txt").textContent);
      });
    });
    cont.querySelectorAll(".del").forEach((btn) =>
      btn.addEventListener("click", (e) => { e.stopPropagation(); borrarRapida(Number(btn.dataset.del)); }));
  }

  function insertarRapida(texto) {
    const ta = $("dRespuesta");
    ta.value = ta.value ? (ta.value.trim() + "\n" + texto) : texto;
    cerrarBarra();
    ta.focus();
  }

  async function guardarRapida() {
    const texto = $("nuevaRapida").value.trim();
    if (!texto) { setMsg("msgRapida", "Escribe el texto.", "error"); return; }
    $("btnGuardarRapida").disabled = true;
    const res = await S.api.crearRapida(texto);
    $("btnGuardarRapida").disabled = false;
    if (res && res.error) { setMsg("msgRapida", res.error, "error"); return; }
    $("nuevaRapida").value = "";
    setMsg("msgRapida", "Guardada.", "ok");
    await cargarRapidas();
  }

  async function borrarRapida(id) {
    const res = await S.api.borrarRapida(id);
    if (res && res.error) { setMsg("msgRapida", res.error, "error"); return; }
    await cargarRapidas();
  }

  function setMsg(id, txt, tipo) {
    const el = $(id);
    if (!el) return;
    el.textContent = txt;
    el.className = "mensaje" + (tipo ? " " + tipo : "");
  }

  function seleccionarBandeja(estado, botones) {
    estadoActual = estado;
    botones.forEach((b) => b.classList.toggle("activa", b.dataset.estado === estado));
    cargarLista();
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    // Solo el super-admin (modo 1) entra a este panel.
    const ok = await window.Plataforma.protegerPagina([1]);
    if (!ok) return;

    const botones = [$("tabPend"), $("tabRev"), $("tabTodos")];
    botones.forEach((b) => b.addEventListener("click", () => seleccionarBandeja(b.dataset.estado, botones)));

    $("btnBuscar").addEventListener("click", cargarLista);
    $("q").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.nativeEvent?.isComposing && e.keyCode !== 229) cargarLista();
    });

    $("btnVolver").addEventListener("click", volver);
    $("btnResponder").addEventListener("click", () => responder(false));
    $("btnResponderRev").addEventListener("click", () => responder(true));
    $("btnToggleEstado").addEventListener("click", alternarEstado);

    $("btnRapidas").addEventListener("click", abrirBarra);
    $("cerrarBarra").addEventListener("click", cerrarBarra);
    $("fondoBarra").addEventListener("click", (e) => { if (e.target === $("fondoBarra")) cerrarBarra(); });
    $("btnGuardarRapida").addEventListener("click", guardarRapida);

    await cargarLista();
    document.documentElement.style.visibility = "visible";
  });
})();
