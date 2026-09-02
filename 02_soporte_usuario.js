(function () {
  "use strict";
  const S = window.Soporte;
  const $ = (id) => document.getElementById(id);

  let tokenActual = "";
  let claveActual = "";

  function mostrar(tab) {
    const enviar = tab === "enviar";
    $("tabEnviar").classList.toggle("activa", enviar);
    $("tabConsultar").classList.toggle("activa", !enviar);
    $("panelEnviar").classList.toggle("oculto", !enviar);
    $("panelConsultar").classList.toggle("oculto", enviar);
  }

  async function enviar() {
    const datos = {
      tipo: $("fTipo").value,
      contacto: $("fNombre").value.trim(),
      asunto: $("fAsunto").value.trim(),
      mensaje: $("fMensaje").value.trim(),
    };
    if (!datos.asunto) { setMsg("msgEnviar", "Escribe un asunto.", "error"); return; }
    if (!datos.mensaje) { setMsg("msgEnviar", "Escribe tu mensaje.", "error"); return; }

    $("btnEnviar").disabled = true;
    setMsg("msgEnviar", "Enviando...", "");
    const res = await S.api.crear(datos);
    $("btnEnviar").disabled = false;

    if (res && res.error) { setMsg("msgEnviar", res.error, "error"); return; }

    setMsg("msgEnviar", "", "");
    tokenActual = res.token;
    claveActual = res.clave;
    $("outToken").textContent = res.token;
    $("outClave").textContent = res.clave;
    $("cajaClave").classList.remove("oculto");
    $("fAsunto").value = "";
    $("fMensaje").value = "";
  }

  async function copiar() {
    const txt = "Token: " + tokenActual + " | Clave: " + claveActual;
    try { await navigator.clipboard.writeText(txt); setMsg("msgEnviar", "Copiado al portapapeles.", "ok"); }
    catch (e) { setMsg("msgEnviar", "Copia manual: " + txt, ""); }
  }

  function irAConsulta() {
    $("cToken").value = tokenActual;
    $("cClave").value = claveActual;
    mostrar("consultar");
    buscar();
  }

  async function buscar() {
    const token = $("cToken").value.trim().toUpperCase();
    const clave = $("cClave").value.trim();
    if (!token || !clave) { setMsg("msgConsultar", "Escribe token y clave.", "error"); return; }

    $("btnBuscar").disabled = true;
    setMsg("msgConsultar", "Buscando...", "");
    const res = await S.api.ver(token, clave);
    $("btnBuscar").disabled = false;

    if (res && res.error) { setMsg("msgConsultar", res.error, "error"); $("hilo").classList.add("oculto"); return; }

    setMsg("msgConsultar", "", "");
    tokenActual = token;
    claveActual = clave;
    pintarHilo(res);
  }

  function pintarHilo(res) {
    const t = res.ticket || {};
    $("hiloAsunto").textContent = t.asunto || "(sin asunto)";
    $("hiloTipo").textContent = t.tipo || "otro";
    const rev = t.estado === "revisado";
    const est = $("hiloEstado");
    est.textContent = rev ? "Respondido / revisado" : "En espera";
    est.className = "pill " + (rev ? "rev" : "pend");

    const chat = $("chat");
    chat.innerHTML = (res.mensajes || []).map((m) => {
      const esUsuario = m.autor === "usuario";
      return '<div class="burbuja ' + (esUsuario ? "usuario" : "soporte") + '">' +
        '<div class="quien">' + (esUsuario ? "Tú" : "Soporte") + '</div>' +
        '<div>' + S.esc(m.cuerpo).replace(/\n/g, "<br>") + '</div>' +
        '<div class="cuando">' + S.esc(S.fecha(m.creado_en)) + '</div>' +
        '</div>';
    }).join("");
    chat.scrollTop = chat.scrollHeight;

    $("hilo").classList.remove("oculto");
  }

  async function responder() {
    const texto = $("cRespuesta").value.trim();
    if (!texto) { setMsg("msgHilo", "Escribe un mensaje.", "error"); return; }
    $("btnResponder").disabled = true;
    setMsg("msgHilo", "Enviando...", "");
    const res = await S.api.responder(tokenActual, claveActual, texto);
    $("btnResponder").disabled = false;
    if (res && res.error) { setMsg("msgHilo", res.error, "error"); return; }
    $("cRespuesta").value = "";
    setMsg("msgHilo", "", "");
    pintarHilo(res);
  }

  function setMsg(id, txt, tipo) {
    const el = $(id);
    if (!el) return;
    el.textContent = txt;
    el.className = "mensaje" + (tipo ? " " + tipo : "");
  }

  document.addEventListener("DOMContentLoaded", () => {
    let motivo = "";
    try { motivo = sessionStorage.getItem("motivo_expiro") || ""; } catch (e) {}
    if (motivo) {
      $("avisoExpiroTxt").textContent = motivo;
      $("avisoExpiro").classList.remove("oculto");
      $("fTipo").value = "renovacion";
      try { sessionStorage.removeItem("motivo_expiro"); } catch (e) {}
    }

    $("tabEnviar").addEventListener("click", () => mostrar("enviar"));
    $("tabConsultar").addEventListener("click", () => mostrar("consultar"));
    $("btnEnviar").addEventListener("click", enviar);
    $("btnCopiar").addEventListener("click", copiar);
    $("btnIrConsulta").addEventListener("click", irAConsulta);
    $("btnBuscar").addEventListener("click", buscar);
    $("btnResponder").addEventListener("click", responder);
    $("btnRefrescar").addEventListener("click", buscar);

    document.documentElement.style.visibility = "visible";
  });
})();
