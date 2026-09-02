/* =====================================================================
   01_AGENDA.JS - Módulo de Gestión de Agenda (Autónomo e Independiente)
   Roles del módulo:
     1 = Admin      -> puede todo
     3 = Agenda     -> página "Agendar cita" (reservar / cancelar / ver canceladas)
     4 = Gestión    -> página "Gestión de agenda" (plantilla semanal + buscar citas)
   ===================================================================== */
(function () {
  "use strict";

  document.documentElement.style.visibility = "hidden";

  const SUPABASE_URL = "https://djbvgglroelnescxkjcw.supabase.co/functions/v1/clever-service";
  const SUPABASE_ANON_KEY = "sb_publishable_v0wAgT-Bbui1ytwpARw4lg_vnKOttEX";
  const TIMEOUT_MS = 15000;

  function obtenerSesion() {
    try { return JSON.parse(sessionStorage.getItem("sesion") || "null"); }
    catch (e) { return null; }
  }

  function borrarSesion() {
    try { sessionStorage.clear(); } catch (e) {}
  }

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
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2>Permisos insuficientes / No autorizado</h2>
        <p>${mensaje || "Tu nivel de acceso no permite ver este módulo."}</p>
      </div></body>`;
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
      if (resp.status === 400 && /sesion no valida|expirada/i.test(detalle)) {
        borrarSesion();
      }
      // Suscripción de la barbería vencida -> a la página de soporte/ayuda.
      if (/^EXPIRADO:/i.test(detalle)) {
        try { sessionStorage.setItem("motivo_expiro", detalle.replace(/^EXPIRADO:\s*/i, "")); } catch (e) {}
        location.replace("02_soporte.html");
        return { error: detalle, expirado: true };
      }
      return { error: detalle };
    }
    return datos === null ? { error: "Respuesta no válida del servidor." } : datos;
  }

  async function protegerPagina(rolesPermitidos) {
    const roles = rolesPermitidos || [1, 4];
    const sesion = obtenerSesion();
    if (!sesion || !sesion.token) {
      location.replace("login.html");
      return false;
    }

    const res = await enviar({ accion: "validar_sesion" });
    if (res.error || !res.usuario) {
      borrarSesion();
      pantallaDenegado("Tu sesión no es válida o expiró. Inicia sesión de nuevo.");
      document.documentElement.style.visibility = "visible";
      return false;
    }

    const modo = Number(res.usuario.Modo);
    _modoActual = modo; // se guarda para que la UI sepa el rol (ej. Admin=1)

    // MULTI-TENANT: los roles de cada barbería son dinámicos (3/4, 5/6, 7/8...),
    // así que el front NO puede tener una lista fija. Si se pasa "*" (o nada),
    // se permite cualquier sesión válida y la Edge Function aplica los permisos
    // por negocio. Si se pasa una lista concreta, se respeta (ej. solo Admin=1).
    const permitirCualquiera = !roles || roles.includes("*");
    if (!permitirCualquiera && !roles.includes(modo)) {
      pantallaDenegado();
      document.documentElement.style.visibility = "visible";
      return false;
    }

    document.documentElement.style.visibility = "visible";
    return true;
  }

  let _modoActual = null;

  const HORA_INICIO = 9;
  const HORA_FIN = 20;
  const SALTO_MIN = 30;

  const HORAS = (() => {
    const out = [];
    for (let h = HORA_INICIO; h < HORA_FIN; h++) {
      for (let m = 0; m < 60; m += SALTO_MIN) {
        out.push(String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"));
      }
    }
    return out;
  })();

  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0];

  // El barbero activo se toma del parámetro ?barbero=ID de la URL.
  function barberoActual() {
    try {
      const p = new URLSearchParams(location.search);
      const id = Number(p.get("barbero"));
      return id && !Number.isNaN(id) ? id : null;
    } catch (e) { return null; }
  }

  // El negocio (barbería) activo se toma de ?negocio=ID. SOLO lo usa el
  // super-admin para navegar; para un miembro el servidor lo deriva del rol
  // e ignora este valor.
  function negocioActual() {
    try {
      const p = new URLSearchParams(location.search);
      const id = Number(p.get("negocio"));
      return id && !Number.isNaN(id) ? id : null;
    } catch (e) { return null; }
  }

  // Inyecta barbero_id en los "datos" de cada petición que lo necesita.
  function conBarbero(datos) {
    const d = Object.assign({}, datos || {});
    const b = barberoActual();
    if (b) d.barbero_id = b;
    const n = negocioActual();
    if (n) d.negocio_id = n; // solo el admin lo aprovecha; el server lo ignora en miembros
    return d;
  }

  // Inyecta negocio_id (para operaciones de admin que no dependen de un barbero).
  function conNegocio(datos) {
    const d = Object.assign({}, datos || {});
    const n = negocioActual();
    if (n) d.negocio_id = n;
    return d;
  }

  // Genera la grilla de horas de un local: inicio/fin ("HH:MM") + intervalo (min).
  function generarHoras(inicio, fin, intervaloMin) {
    const out = [];
    const [hi, mi] = String(inicio || "09:00").split(":").map(Number);
    const [hf, mf] = String(fin || "20:00").split(":").map(Number);
    const paso = Number(intervaloMin) > 0 ? Number(intervaloMin) : 30;
    let t = hi * 60 + (mi || 0);
    const finMin = hf * 60 + (mf || 0);
    while (t < finMin) {
      out.push(String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"));
      t += paso;
    }
    return out;
  }

  const api = {
    // ---- Negocios / barberías (multi-tenant; viajan por "buscar_citas" op) ----
    listarNegocios: () => enviar({ accion: "buscar_citas", datos: { op: "listar_negocios" } }),
    crearNegocio: (datos) => enviar({ accion: "buscar_citas", datos: Object.assign({ op: "crear_negocio" }, datos || {}) }),
    estadoNegocio: () => enviar({ accion: "buscar_citas", datos: conNegocio({ op: "estado_negocio" }) }),
    editarNegocio: (datos) => enviar({ accion: "buscar_citas", datos: Object.assign({ op: "editar_negocio" }, datos || {}) }),
    renovarNegocio: (datos) => enviar({ accion: "buscar_citas", datos: Object.assign({ op: "renovar_negocio" }, datos || {}) }),

    // ---- Barberos: viajan DENTRO de "buscar_citas" (op) para no tocar el router ----
    listarBarberos: () => enviar({ accion: "buscar_citas", datos: conNegocio({ op: "listar_barberos" }) }),
    crearBarbero: (nombre, claveAdmin) =>
      enviar({ accion: "buscar_citas", datos: conNegocio({ op: "crear_barbero", nombre, clave_admin: claveAdmin }) }),

    // ---- Agenda (todas van scoped al barbero de la URL) ----
    // La plantilla también viaja por "buscar_citas" (op) para no depender de una
    // acción del router que no recibe "datos".
    obtenerDisponibilidad: () => enviar({ accion: "buscar_citas", datos: conBarbero({ op: "plantilla" }) }),
    guardarDisponibilidad: (dia_semana, hora, activo) =>
      enviar({ accion: "guardar_disponibilidad", datos: conBarbero({ dia_semana, hora, activo }) }),
    obtenerSlotsDia: (fecha) => enviar({ accion: "obtener_slots_dia", datos: conBarbero({ fecha }) }),
    crearCita: (datos) => enviar({ accion: "crear_cita", datos: conBarbero(datos) }),
    cancelarCita: (datos) => enviar({ accion: "cancelar_cita", datos: datos || {} }),
    buscarCitas: (datos) => enviar({ accion: "buscar_citas", datos: conBarbero(datos) }),
  };

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function hoyISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // Devuelve el id del barbero de la URL, o redirige a la lista si falta.
  function exigirBarberoEnURL() {
    const b = barberoActual();
    if (!b) { location.replace("01_barberos.html"); return null; }
    return b;
  }

  window.Agenda = {
    api,
    HORAS,
    DIAS,
    DIAS_ORDEN,
    esc,
    hoyISO,
    barberoActual,
    negocioActual,
    generarHoras,
    exigirBarberoEnURL,
    modoActual: () => _modoActual,
    esAdmin: () => Number(_modoActual) === 1,
    // Roles dinámicos por barbería: cualquier sesión válida entra; el server manda.
    protegerPagina: () => protegerPagina(["*"])
  };

  window.Plataforma = {
    // Por defecto permite cualquier sesión válida (multi-tenant). Pasa [1] para
    // restringir SOLO al super-admin (ej. página de creación de barberías).
    protegerPagina: (roles) => protegerPagina(roles || ["*"]),
    obtenerSesion
  };
})();
