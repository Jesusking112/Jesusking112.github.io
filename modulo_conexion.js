/* =====================================================================
   Cambios de seguridad:
     - La sesion se identifica con un TOKEN (X-Session-Token) que emite
       el servidor. El rol NO se confia al navegador.
     - protegerPagina() valida la sesion CONTRA EL SERVIDOR antes de
       mostrar cualquier pagina sensible.
     - Ya no se piden usuario/contrasena de admin en cada accion: basta
       la sesion de administrador (el servidor la verifica).
   ===================================================================== */
(function () {
  "use strict";

  /* ===================================================================
     CONFIGURACION  (unico lugar donde van las claves publicas)
     =================================================================== */
  const SUPABASE_URL = "https://djbvgglroelnescxkjcw.supabase.co/functions/v1/clever-service";
  const SUPABASE_ANON_KEY = "sb_publishable_v0wAgT-Bbui1ytwpARw4lg_vnKOttEX";

  const TIMEOUT_MS = 15000;

  /* ===================================================================
     SESION
     =================================================================== */
  function obtenerSesion() {
    try { return JSON.parse(sessionStorage.getItem("sesion") || "null"); }
    catch (e) { return null; }
  }
  function guardarSesion(s) { sessionStorage.setItem("sesion", JSON.stringify(s)); }
  function borrarSesion() { try { sessionStorage.clear(); } catch (e) {} }

  /* ===================================================================
     NUCLEO
     =================================================================== */
  async function enviarPeticion(cuerpo) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return { error: "Faltan las claves de Supabase en modulo_conexion.js" };
    }

    const sesion = obtenerSesion();
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);

    let respuesta;
    try {
      respuesta = await fetch(SUPABASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + SUPABASE_ANON_KEY,
          "apikey": SUPABASE_ANON_KEY,

          "X-Session-Token": (sesion && sesion.token) ? sesion.token : "",
        },
        body: JSON.stringify(cuerpo),
        signal: control.signal,
      });
    } catch (e) {
      clearTimeout(temporizador);
      if (e.name === "AbortError") return { error: "El servidor tardo demasiado (timeout)." };
      return { error: "Fallo de red o CORS. Revisa ORIGENES_PERMITIDOS en la Edge Function." };
    }
    clearTimeout(temporizador);

    let texto = "";
    try { texto = await respuesta.text(); } catch (e) { texto = ""; }
    let datos = null;
    if (texto) { try { datos = JSON.parse(texto); } catch (e) { datos = null; } }

    if (!respuesta.ok) {
      const detalle = (datos && (datos.error || datos.message)) || texto || "sin detalle";

      if (respuesta.status === 400 && /sesion no valida|expirada/i.test(detalle)) {
        borrarSesion();
      }
      return { error: detalle };
    }
    if (datos === null) return { error: "Respuesta no valida del servidor." };
    return datos;
  }

  /* ===================================================================
     API
     =================================================================== */
  const api = {
    login:            (datos)              => enviarPeticion({ accion: "login", datos }),
    validarSesion:    ()                   => enviarPeticion({ accion: "validar_sesion" }),
    logout:           ()                   => enviarPeticion({ accion: "logout" }),
    obtenerModos:     ()                   => enviarPeticion({ accion: "obtener_modos" }),
    obtenerTodos:     ()                   => enviarPeticion({ accion: "obtener_todos" }),
    crearUsuario:     (datos)              => enviarPeticion({ accion: "crear_usuario", datos }),
    resetearPassword: (id, nuevaPassword)  => enviarPeticion({ accion: "resetear_password", id, datos: { nuevaPassword } }),
    obtenerLogs:      (id)                 => enviarPeticion({ accion: "obtener_logs_usuario", id }),
    eliminarUsuario:  (id)                 => enviarPeticion({ accion: "eliminar_usuario", id }),
  };

  /* ===================================================================
     UTILIDADES
     =================================================================== */
  const $ = (id) => document.getElementById(id);

  // Escapa texto antes de inyectarlo en innerHTML (previene XSS almacenado).
  function esc(valor) {
    return String(valor == null ? "" : valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  let captchaGenerado = "";
  function generarCaptcha() {
    captchaGenerado = Math.floor(100000 + Math.random() * 900000).toString();
    const canvas = $("canvasCaptcha");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.5)`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.stroke();
    }
    ctx.font = "bold 20px 'Courier New', monospace";
    ctx.fillStyle = "#1e293b";
    ctx.textBaseline = "middle";
    for (let i = 0; i < captchaGenerado.length; i++) {
      ctx.save();
      ctx.translate(12 + i * 16, canvas.height / 2);
      ctx.rotate((Math.random() * 20 - 10) * Math.PI / 180);
      ctx.fillText(captchaGenerado[i], 0, 0);
      ctx.restore();
    }
  }

  async function obtenerFingerprint() {
    let dataURL = "";
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60"; ctx.fillRect(0, 0, 100, 20);
      ctx.fillStyle = "#069"; ctx.fillText("device-fingerprint", 2, 2);
      dataURL = canvas.toDataURL();
    } catch (e) { dataURL = "no-canvas"; }

    const crudo = [
      navigator.userAgent, navigator.language, (navigator.languages || []).join(","),
      screen.width + "x" + screen.height, screen.colorDepth, new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || "", navigator.platform || "", dataURL,
    ].join("||");

    try {
      if (crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(crudo));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
      }
    } catch (e) {}
    let h = 0;
    for (let i = 0; i < crudo.length; i++) { h = (h << 5) - h + crudo.charCodeAt(i); h |= 0; }
    return "fp" + (h >>> 0).toString(16).padStart(8, "0");
  }

  function generarPDFAuditoria(titulo, lineas) {
    const limpia = (s) => String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
    const esc = (s) => limpia(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const lineasPorPagina = 45;
    const chunks = [];
    for (let i = 0; i < lineas.length; i += lineasPorPagina) chunks.push(lineas.slice(i, i + lineasPorPagina));
    if (chunks.length === 0) chunks.push([]);
    const pageObjNums = [], contentObjNums = [];
    let obj = 4;
    for (let p = 0; p < chunks.length; p++) { pageObjNums.push(obj++); contentObjNums.push(obj++); }
    const maxObj = obj - 1;
    const streams = chunks.map((chunk, pi) => {
      let s = "", y = 800;
      if (pi === 0) { s += `BT /F1 18 Tf 50 ${y} Td (${esc(titulo)}) Tj ET\n`; y -= 28; }
      for (const linea of chunk) { s += `BT /F1 10 Tf 50 ${y} Td (${esc(linea)}) Tj ET\n`; y -= 15; }
      return s;
    });
    const objs = {};
    objs[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    objs[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => n + " 0 R").join(" ")}] /Count ${pageObjNums.length} >>\nendobj\n`;
    objs[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`;
    for (let p = 0; p < chunks.length; p++) {
      const pn = pageObjNums[p], cn = contentObjNums[p], cs = streams[p];
      objs[pn] = `${pn} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cn} 0 R >>\nendobj\n`;
      objs[cn] = `${cn} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}endstream\nendobj\n`;
    }
    let pdf = "%PDF-1.4\n";
    const offsets = [];
    for (let n = 1; n <= maxObj; n++) { offsets[n] = pdf.length; pdf += objs[n]; }
    const xref = pdf.length;
    pdf += `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= maxObj; n++) pdf += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
    pdf += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria_${limpia(titulo).replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ===================================================================
     PROTECCION DE PAGINA (verificada en el servidor)
     =================================================================== */
  function pantallaDenegado(mensaje) {
    document.documentElement.innerHTML = `
      <head><meta charset="UTF-8"><title>Acceso denegado</title>
      <style>
        body{background:#0b0f19;color:#f3f4f6;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
        display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box}
        .tarjeta-bloqueo{background:#111827;border:1px solid #374151;padding:40px;border-radius:12px;text-align:center;max-width:450px;box-shadow:0 10px 25px rgba(0,0,0,.5)}
        .icono-bloqueo{color:#ef4444;background:rgba(239,68,68,.1);width:60px;height:60px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px}
        h2{font-size:22px;margin:0 0 10px;font-weight:700;letter-spacing:-.5px}
        p{color:#9ca3af;font-size:14px;line-height:1.6;margin:0}
      </style></head>
      <body><div class="tarjeta-bloqueo">
        <div class="icono-bloqueo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>
        <h2>Permisos no autorizados</h2>
        <p>${mensaje || "Tu nivel de acceso no permite ver este modulo. Si crees que es un error, contacta al encargado del sistema."}</p>
      </div></body>`;
  }

  async function protegerPagina(rolesPermitidos) {
    const raiz = document.documentElement;
    raiz.style.visibility = "hidden";

    const sesion = obtenerSesion();
    if (!sesion || !sesion.token) {
      try { (window.top || window).location.replace("login.html"); } catch (e) { location.replace("login.html"); }
      return false;
    }

    const res = await api.validarSesion();
    if (res.error || !res.usuario) {
      borrarSesion();
      pantallaDenegado("Tu sesion no es valida o expiro. Inicia sesion de nuevo.");
      raiz.style.visibility = "visible";
      return false;
    }

    const modo = Number(res.usuario.Modo);
    sesion.Modo = modo;
    sesion.User = res.usuario.User;
    guardarSesion(sesion);

    if (!rolesPermitidos.includes(modo)) {
      pantallaDenegado();
      raiz.style.visibility = "visible";
      return false;
    }

    raiz.style.visibility = "visible";
    return true;
  }

  /* ===================================================================
     CONTROLADOR LOGIN
     =================================================================== */
  function iniciarLogin() {
    generarCaptcha();
    if ($("btnOjo")) {
      $("btnOjo").addEventListener("click", () => {
        const inp = $("txtPassword");
        inp.type = inp.type === "password" ? "text" : "password";
      });
    }
    function setMensaje(texto, tipo) {
      const m = $("mensaje"); if (!m) return;
      m.textContent = texto; m.className = "mensaje" + (tipo ? " " + tipo : "");
    }

    async function iniciarSesion() {
      const user = $("txtUser").value.trim();
      const pass = $("txtPassword").value;
      const inputCaptcha = $("txtCaptcha") ? $("txtCaptcha").value.trim() : "";
      if (!user || !pass) { setMensaje("Completa usuario y contrasena.", "error"); return; }
      if (inputCaptcha !== captchaGenerado) {
        setMensaje("Codigo CAPTCHA incorrecto.", "error");
        generarCaptcha(); if ($("txtCaptcha")) $("txtCaptcha").value = ""; return;
      }
      $("btnEntrar").disabled = true;
      setMensaje("Verificando credenciales...");

      const fingerprint = await obtenerFingerprint();
      const res = await api.login({ User: user, Password: pass, fingerprint, userAgent: navigator.userAgent });
      if (res.error) {
        setMensaje(res.error, "error");
        $("btnEntrar").disabled = false;
        $("txtPassword").value = "";
        generarCaptcha(); if ($("txtCaptcha")) $("txtCaptcha").value = "";
        return;
      }

      guardarSesion({
        token: res.token,
        User: res.usuario.User,
        Modo: res.usuario.Modo,
        ip: res.sesion.ip,
        fingerprint: res.sesion.fingerprint,
        fecha: res.sesion.fecha,
        expira: res.sesion.expira,
        activa: true,
      });

      setMensaje("Acceso concedido. Redirigiendo...", "ok");
      window.location.href = "menu.html";
    }

    $("btnEntrar").addEventListener("click", iniciarSesion);
    $("txtPassword").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) iniciarSesion();
    });
    if ($("txtCaptcha")) {
      $("txtCaptcha").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) iniciarSesion();
      });
    }
  }

  /* ===================================================================
     CONTROLADOR GESTION DE USUARIOS
     =================================================================== */
  function iniciarCrearUsuarios() {
    let cacheUsuarios = [];

    async function cargarModos() {
      const modos = await api.obtenerModos();
      if (modos.error) { $("resultado").innerText = "Error: " + modos.error; return; }
      const select = $("selectModo");
      select.innerHTML = "";
      modos.filter((m) => m.modo !== 1).forEach((m) => {
        const o = document.createElement("option");
        o.value = m.modo; o.text = `${m.modo} - ${m.tipo}`;
        select.appendChild(o);
      });
    }

    async function cargarTabla() {
      const lista = await api.obtenerTodos();
      if (lista.error) { $("resultado").innerText = "Error: " + lista.error; return; }
      cacheUsuarios = lista;
      renderizarTabla(cacheUsuarios);
    }

    function renderizarTabla(datos) {
      const c = $("contenedorTabla");
      if (!datos.length) { c.innerHTML = "<p style='text-align:center;color:#93a4c2;padding:12px;'>No se encontraron resultados</p>"; return; }
      let html = `<table><thead><tr><th>Usuario</th><th>Modo</th><th>Estado</th><th>Accion</th></tr></thead><tbody>`;
      datos.forEach((u) => {
        const idNum = Number(u.id);
        html += `<tr>
          <td><strong>${esc(u.User)}</strong></td>
          <td>${esc(u.Modo)}</td>
          <td>${u.activo === false ? "Inactivo" : "Activo"}</td>
          <td><div class="celda-acciones">
            <button class="btn-ver" data-reset="${idNum}">Resetear clave</button>
            <button class="btn-eliminar" data-eliminar="${idNum}">Eliminar</button>
          </div></td>
        </tr>`;
      });
      html += `</tbody></table>`;
      c.innerHTML = html;
      c.querySelectorAll("[data-reset]").forEach((b) =>
        b.addEventListener("click", () => resetearUI(Number(b.getAttribute("data-reset")))));
      c.querySelectorAll("[data-eliminar]").forEach((b) =>
        b.addEventListener("click", () => eliminarUI(Number(b.getAttribute("data-eliminar")))));
    }

    async function resetearUI(id) {
      const nueva = prompt("Nueva contrasena para este usuario (minimo 8 caracteres):");
      if (nueva == null) return;
      if (nueva.length < 8) { alert("La contrasena debe tener al menos 8 caracteres."); return; }
      $("resultado").innerText = "Actualizando contrasena...";
      const res = await api.resetearPassword(id, nueva);
      if (res.error) { $("resultado").innerText = "Error: " + res.error; alert("Error: " + res.error); }
      else { $("resultado").innerText = res.mensaje || "Contrasena actualizada."; }
    }

    async function eliminarUI(id) {
      if (!confirm("Se generara un PDF de auditoria y luego se eliminara el usuario y su tabla de logs. Continuar?")) return;
      $("resultado").innerText = "Recuperando historial para auditoria...";
      const logsRes = await api.obtenerLogs(id);
      if (logsRes.error) { $("resultado").innerText = "Error: " + logsRes.error; alert("Error: " + logsRes.error); return; }

      const u = logsRes.usuario, logs = logsRes.logs || [];
      const lineas = [];
      lineas.push("REGISTRO DE AUDITORIA - ELIMINACION DE USUARIO");
      lineas.push("");
      lineas.push("Usuario: " + u.User);
      lineas.push("Modo/Rol: " + u.Modo);
      lineas.push("Tabla de logs: " + logsRes.tabla);
      lineas.push("Fecha de emision: " + new Date().toLocaleString());
      lineas.push("Total de accesos registrados: " + logs.length);
      lineas.push("");
      lineas.push("----------------------------------------------------------");
      lineas.push("HISTORIAL DE CONEXIONES");
      lineas.push("----------------------------------------------------------");
      if (!logs.length) { lineas.push("Sin registros de conexion."); }
      else {
        logs.forEach((l, i) => {
          const f = l.fecha ? new Date(l.fecha).toLocaleString() : "-";
          lineas.push(`#${i + 1}  ${f}`);
          lineas.push(`     IP: ${l.ip || "-"}   Evento: ${l.evento || "login"}`);
          lineas.push(`     Huella equipo: ${l.fingerprint || "-"}`);
          lineas.push("");
        });
      }
      generarPDFAuditoria("Auditoria " + u.User, lineas);

      $("resultado").innerText = "PDF generado. Eliminando usuario...";
      const res = await api.eliminarUsuario(id);
      if (res.error) { $("resultado").innerText = "Error al eliminar: " + res.error; alert("Error: " + res.error); }
      else { $("resultado").innerText = res.mensaje || "Eliminado"; $("txtBuscar").value = ""; cargarTabla(); }
    }

    $("txtBuscar").addEventListener("input", (e) => {
      const t = e.target.value.toLowerCase();
      renderizarTabla(cacheUsuarios.filter((u) => u.User.toLowerCase().includes(t)));
    });

    $("btnGuardar").addEventListener("click", async () => {
      const user = $("txtUser").value.trim();
      const pass = $("txtPassword").value;
      const modo = parseInt($("selectModo").value);
      if (!user || !pass || isNaN(modo)) return alert("Llena todos los campos");
      if (pass.length < 8) return alert("La contrasena debe tener al menos 8 caracteres.");
      $("resultado").innerText = "Guardando...";
      const res = await api.crearUsuario({ User: user, Password: pass, Modo: modo });
      if (res.error) { $("resultado").innerText = "Error: " + res.error; alert("Error: " + res.error); }
      else {
        $("resultado").innerText = res.mensaje || "Listo";
        $("txtUser").value = ""; $("txtPassword").value = ""; $("txtBuscar").value = "";
        cargarTabla();
      }
    });

    $("btnUsuarios").addEventListener("click", () => { $("txtBuscar").value = ""; cargarTabla(); });

    (async () => {
      $("resultado").innerText = "Cargando datos...";
      await cargarModos();
      await cargarTabla();
      $("resultado").innerText = "Sistema listo.";
    })();
  }

  /* ===================================================================
     API GLOBAL + ARRANQUE (auto-deteccion de pagina)
     =================================================================== */
  window.Plataforma = {
    api,
    obtenerSesion,
    guardarSesion,
    borrarSesion,
    protegerPagina,
    iniciarCrearUsuarios,
    generarPDFAuditoria,
  };

  document.addEventListener("DOMContentLoaded", () => {
    if ($("btnEntrar") && $("txtUser") && $("txtPassword")) {
      iniciarLogin();
    }
  });
})();