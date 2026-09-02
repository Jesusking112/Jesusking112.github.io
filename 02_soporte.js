/* ============================================================
   MÓDULO DE SOPORTE (02) — Cliente
   cualquiera puede abrir un ticket y consultar respuestas con su
   clave, sin sesión iniciada. El panel de admin sí usa la sesión
   (modo 1) que ya guarda el módulo de barbería en sessionStorage.
   ============================================================ */
(function () {
  "use strict";

  const SUPABASE_URL = "https://djbvgglroelnescxkjcw.supabase.co/functions/v1/clever-service";
  const SUPABASE_ANON_KEY = "sb_publishable_v0wAgT-Bbui1ytwpARw4lg_vnKOttEX";
  const TIMEOUT_MS = 15000;

  function obtenerSesion() {
    try { return JSON.parse(sessionStorage.getItem("sesion") || "null"); }
    catch (e) { return null; }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fecha(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const hoy = new Date();
    const mismoDia = d.toDateString() === hoy.toDateString();
    const hora = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (mismoDia) return "Hoy " + hora;
    return d.toLocaleDateString([], { day: "2-digit", month: "short" }) + " " + hora;
  }

  async function enviar(cuerpo) {
    const sesion = obtenerSesion();
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(SUPABASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + SUPABASE_ANON_KEY,
          "apikey": SUPABASE_ANON_KEY,
          "X-Session-Token": sesion && sesion.token ? sesion.token : "",
        },
        body: JSON.stringify(cuerpo),
        signal: control.signal,
      });
    } catch (e) {
      clearTimeout(t);
      return { error: e.name === "AbortError" ? "Tiempo de espera agotado." : "Fallo de conexión." };
    }
    clearTimeout(t);

    let texto = "";
    try { texto = await resp.text(); } catch (e) { texto = ""; }
    let datos = null;
    if (texto) { try { datos = JSON.parse(texto); } catch (e) { datos = null; } }

    if (!resp.ok) {
      const detalle = (datos && (datos.error || datos.message)) || texto || "Error del servidor.";
      return { error: detalle };
    }
    return datos == null ? {} : datos;
  }

  function op(nombre, datos) {
    return enviar({ accion: "buscar_citas", datos: Object.assign({ op: nombre }, datos || {}) });
  }

  const api = {
    crear: (datos) => op("sop_crear", datos),
    ver: (token, clave) => op("sop_ver_ticket", { token, clave }),
    responder: (token, clave, cuerpo) => op("sop_responder_usuario", { token, clave, cuerpo }),

    listar: (estado, q) => op("sop_admin_listar", { estado, q }),
    verAdmin: (id) => op("sop_admin_ver", { id }),
    responderAdmin: (id, cuerpo, marcarRevisado) =>
      op("sop_admin_responder", { id, cuerpo, marcar_revisado: !!marcarRevisado }),
    marcar: (id, estado) => op("sop_admin_estado", { id, estado }),
    listarRapidas: () => op("sop_rapidas_listar", {}),
    crearRapida: (texto) => op("sop_rapidas_crear", { texto }),
    borrarRapida: (id) => op("sop_rapidas_borrar", { id }),
  };

  window.Soporte = { api, esc, fecha, obtenerSesion };

  document.addEventListener("DOMContentLoaded", function () {
    const btn = document.getElementById("btnRegresar");
    if (!btn) return;
    const hayHistorial = window.history.length > 1 || (document.referrer && document.referrer !== location.href);
    if (!hayHistorial) return;
    btn.style.display = "";
    btn.addEventListener("click", function () { window.history.back(); });
  });
})();
