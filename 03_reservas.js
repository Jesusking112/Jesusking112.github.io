/* ============================================================
   MÓDULO 03 · RESERVAS — Cliente compartido
   100% INDEPENDIENTE. NO usa la Edge Function.
   Llama DIRECTO a Supabase por PostgREST:
     POST /rest/v1/rpc/<funcion>   con la anon key.
   Toda la seguridad vive en las funciones SQL (SECURITY DEFINER)
   y en la RLS de las tablas (ver supabase_reservas.sql).
   ============================================================ */
(function () {
  "use strict";

  const SUPABASE_URL = "https://djbvgglroelnescxkjcw.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_v0wAgT-Bbui1ytwpARw4lg_vnKOttEX";
  const REST_RPC = SUPABASE_URL + "/rest/v1/rpc/";
  const TIMEOUT_MS = 15000;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function rpc(fn, params) {
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(REST_RPC + fn, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + SUPABASE_ANON_KEY,
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(params || {}),
        signal: control.signal,
      });
    } catch (e) {
      clearTimeout(t);
      throw new Error(e.name === "AbortError" ? "Tiempo de espera agotado." : "Fallo de conexión.");
    }
    clearTimeout(t);

    let texto = "";
    try { texto = await resp.text(); } catch (e) { texto = ""; }
    let datos = null;
    if (texto) { try { datos = JSON.parse(texto); } catch (e) { datos = null; } }

    if (!resp.ok) {
      const detalle = (datos && (datos.message || datos.hint || datos.details || datos.error))
        || texto || "No se pudo procesar la solicitud.";
      throw new Error(detalle);
    }
    return datos == null ? {} : datos;
  }

  const api = {
    config: (slug) => rpc("res_config", { p_slug: slug }),
    diasMes: (slug, anio, mes, rol) => rpc("res_dias_mes", { p_slug: slug, p_anio: anio, p_mes: mes, p_rol: rol || null }),
    horasDia: (slug, fecha, rol) => rpc("res_horas_dia", { p_slug: slug, p_fecha: fecha, p_rol: rol || null }),
    personasSlot: (slug, fecha, hora, rol) => rpc("res_personas_slot", { p_slug: slug, p_fecha: fecha, p_hora: hora, p_rol: rol || null }),
    crearCita: (slug, d) => rpc("res_crear_cita", {
      p_slug: slug, p_persona_id: d.persona_id, p_fecha: d.fecha, p_hora: d.hora,
      p_nombre: d.nombre, p_contacto: d.contacto || null, p_clave_cancelacion: d.clave_cancelacion,
    }),
    cancelar: (cita_id, clave_cancelacion) =>
      rpc("res_cancelar", { p_cita_id: cita_id, p_clave_cancelacion: clave_cancelacion }),

    gCrear: (slug, nombre, clave_nueva, clave_creacion) =>
      rpc("res_g_crear", { p_slug: slug, p_nombre: nombre, p_clave_nueva: clave_nueva, p_clave_creacion: clave_creacion || null }),
    gConfig: (slug, clave) => rpc("res_g_config", { p_slug: slug, p_clave_gestion: clave }),
    gGuardarConfig: (slug, clave, cambios) => rpc("res_g_guardar_config", Object.assign({
      p_slug: slug, p_clave_gestion: clave,
    }, mapConfig(cambios))),
    gPersonas: (slug, clave) => rpc("res_g_personas", { p_slug: slug, p_clave_gestion: clave }),
    gDisponibilidad: (slug, clave, persona_id, desde, hasta) =>
      rpc("res_g_disponibilidad", { p_slug: slug, p_clave_gestion: clave, p_persona_id: persona_id, p_desde: desde, p_hasta: hasta }),
    gSetDia: (slug, clave, persona_id, fecha, horas) =>
      rpc("res_g_set_dia", { p_slug: slug, p_clave_gestion: clave, p_persona_id: persona_id, p_fecha: fecha, p_horas: horas || [] }),
    gBulk: (slug, clave, persona_id, d) =>
      rpc("res_g_bulk", {
        p_slug: slug, p_clave_gestion: clave, p_persona_id: persona_id,
        p_desde: d.desde, p_hasta: d.hasta, p_dias: d.dias || [], p_horas: d.horas || [], p_modo: d.modo || "reemplazar",
      }),
    gCitasMes: (slug, clave, anio, mes) =>
      rpc("res_g_citas_mes", { p_slug: slug, p_clave_gestion: clave, p_anio: anio, p_mes: mes }),
    gCancelar: (slug, clave, cita_id) =>
      rpc("res_g_cancelar", { p_slug: slug, p_clave_gestion: clave, p_cita_id: cita_id }),

    aCrearPersona: (slug, claveAdmin, nombre, rol) =>
      rpc("res_a_crear_persona", { p_slug: slug, p_clave_admin: claveAdmin, p_nombre: nombre, p_rol: rol || null }),
    aEditarPersona: (slug, claveAdmin, persona_id, cambios) =>
      rpc("res_a_editar_persona", {
        p_slug: slug, p_clave_admin: claveAdmin, p_persona_id: persona_id,
        p_nombre: cambios.nombre != null ? cambios.nombre : null,
        p_rol: cambios.rol != null ? cambios.rol : null,
        p_activo: cambios.activo != null ? cambios.activo : null,
      }),
    aEliminarPersona: (slug, claveAdmin, persona_id) =>
      rpc("res_a_eliminar_persona", { p_slug: slug, p_clave_admin: claveAdmin, p_persona_id: persona_id }),
    aSetClave: (slug, claveActual, claveNueva) =>
      rpc("res_a_set_clave", { p_slug: slug, p_clave_admin_actual: claveActual, p_clave_nueva: claveNueva }),
  };

  function mapConfig(c) {
    const out = {};
    if (!c) return out;
    if (c.nombre != null) out.p_nombre = c.nombre;
    if (c.intervalo_min != null) out.p_intervalo_min = c.intervalo_min;
    if (c.hora_inicio != null) out.p_hora_inicio = c.hora_inicio;
    if (c.hora_fin != null) out.p_hora_fin = c.hora_fin;
    if (c.anticipacion_horas != null) out.p_anticipacion_horas = c.anticipacion_horas;
    if (c.max_dias_adelante != null) out.p_max_dias_adelante = c.max_dias_adelante;
    if (c.activo != null) out.p_activo = c.activo;
    if (c.clave_nueva != null) out.p_clave_nueva = c.clave_nueva;
    if (c.telefono != null) out.p_telefono = c.telefono;
    if (c.logo1_url != null) out.p_logo1_url = c.logo1_url;
    if (c.logo2_url != null) out.p_logo2_url = c.logo2_url;
    return out;
  }

  window.Reservas = { api, esc };
})();
