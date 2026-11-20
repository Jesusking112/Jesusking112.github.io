// =============================================================================
// 006 · EDGE FUNCTION "conjuntos-service"  (Supabase > Edge Functions > nombre: conjuntos-service)
// Pegar este archivo COMPLETO como index.ts de la función.
// Desactivar "Verify JWT" (Enforce JWT): la sesión es propia (token).
//
// Secretos (Edge Functions > Secrets):
//   CREADOR_CLAVE -> tu clave para crear conjuntos (si no existe usa la de respaldo de abajo)
//   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase automáticamente)
//
// Todas las peticiones: POST { op: "...", token?: "...", ...datos }
// =============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLAVE_CREADOR = Deno.env.get("CREADOR_CLAVE") ?? "Anma112358";
const DIAS_GRACIA = 5;
const REPARTOS = ["igual", "fijo", "coeficiente", "seleccion", "manual"];
const TIPOS_VISITA = ["visita", "domicilio", "servicio", "taxi", "trabajador", "otro"];

class Falla extends Error {}
const falla = (m: string): never => { throw new Falla(m); };

// deno-lint-ignore no-explicit-any
type D = Record<string, any>;
type S = { rol: string; usuario_id: string | null; conjunto_id: string; casa_id: string | null; nombre: string };

// ----------------------------------------------------------------------------- utilidades
const txt = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const plata = (v: unknown) => { const n = num(v); return n === null || n < 0 ? null : Math.round(n); };
const soloDigitos = (v: unknown, max = 15) => String(v ?? "").replace(/\D/g, "").slice(0, max);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hoy() { return new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); }
function periodoOk(v: unknown) {
  const p = txt(v, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p) ? p : hoy().slice(0, 7);
}
function fechaOk(v: unknown) { const f = txt(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null; }
function sumarDias(f: string, n: number) {
  const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function sumarMeses(f: string, n: number) {
  const d = new Date(f + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10);
}
function usuarioOk(v: unknown) {
  const u = txt(v, 40).toLowerCase().replace(/\s+/g, "");
  if (!/^[a-z0-9._-]{3,40}$/.test(u)) falla("El usuario debe tener de 3 a 40 caracteres (letras, números, punto o guion)");
  return u;
}
function claveOk(v: unknown) {
  const c = String(v ?? "");
  if (c.length < 4) falla("La clave debe tener al menos 4 caracteres");
  return c;
}
function slug(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function hex(buf: ArrayBuffer) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function sha256(s: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
async function pbkdf2(clave: string, salHex: string, iter: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  const sal = new Uint8Array(salHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iter }, key, 256));
}
async function hashClave(clave: string) {
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const iter = 100000;
  return `pbkdf2$${iter}$${sal}$${await pbkdf2(clave, sal, iter)}`;
}
async function verificarClave(clave: string, guardado: string) {
  const [alg, iter, sal, h] = String(guardado || "").split("$");
  if (alg !== "pbkdf2" || !h) return false;
  const calc = await pbkdf2(clave, sal, Number(iter));
  let dif = calc.length ^ h.length;
  for (let i = 0; i < Math.min(calc.length, h.length); i++) dif |= calc.charCodeAt(i) ^ h.charCodeAt(i);
  return dif === 0;
}
function tokenAleatorio() { return hex(crypto.getRandomValues(new Uint8Array(32)).buffer); }
function claveAleatoria() { return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0"); }

async function q<T = D>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) {
    if (/duplicate key/i.test(error.message)) falla("Ya existe un registro con ese dato (usuario o código repetido)");
    falla(error.message);
  }
  return data as T;
}

// Trae más de 1000 filas paginando (PostgREST limita a 1000 por respuesta).
async function todos(armar: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, max = 6000) {
  const out: D[] = [];
  for (let i = 0; i < max; i += 1000) {
    const parte = await q<D[]>(armar(i, i + 999));
    out.push(...(parte || []));
    if (!parte || parte.length < 1000) break;
  }
  return out;
}

// ----------------------------------------------------------------------------- sesión
function bloqueoConjunto(c: D | null) {
  if (!c) return "El conjunto no existe";
  if (c.estado !== "activo") return "El servicio de este conjunto está suspendido. Contacta a la administración.";
  if (c.vence && sumarDias(c.vence, DIAS_GRACIA) < hoy()) return "La suscripción de este conjunto venció. Contacta a la administración.";
  return null;
}

async function crearSesion(usuario_id: string | null, rol: string, conjunto_id: string | null, dias: number) {
  const token = tokenAleatorio();
  await q(db.from("conjuntos_sesiones").insert({
    token_hash: await sha256(token), usuario_id, rol, conjunto_id,
    expira: new Date(Date.now() + dias * 86400e3).toISOString(),
  }));
  return token;
}

async function sesion(token: unknown, roles: string[]): Promise<S> {
  if (!token || typeof token !== "string") falla("SESION: inicia sesión");
  const { data } = await db.from("conjuntos_sesiones").select("*").eq("token_hash", await sha256(token as string)).maybeSingle();
  if (!data || new Date(data.expira) < new Date()) falla("SESION: tu sesión venció, entra de nuevo");
  if (!roles.includes(data!.rol)) falla("No tienes permiso para esto");
  if (data!.rol === "creador") return { rol: "creador", usuario_id: null, conjunto_id: "", casa_id: null, nombre: "Creador" };
  const { data: u } = await db.from("conjuntos_usuarios").select("id,estado,rol,casa_id,conjunto_id,nombre").eq("id", data!.usuario_id).maybeSingle();
  if (!u || u.estado !== "activo") falla("SESION: tu usuario fue bloqueado. Habla con la administración.");
  const { data: c } = await db.from("conjuntos_conjuntos").select("estado,vence").eq("id", u!.conjunto_id).maybeSingle();
  const bloqueo = bloqueoConjunto(c);
  if (bloqueo) falla("SESION: " + bloqueo);
  return { rol: u!.rol, usuario_id: u!.id, conjunto_id: u!.conjunto_id, casa_id: u!.casa_id, nombre: u!.nombre || "" };
}

async function plataforma() {
  const p = await q<D | null>(db.from("conjuntos_plataforma").select("titular,nequi,daviplata,llave,banco,whatsapp,horario,notas,qr").eq("id", 1).maybeSingle());
  return p ?? {};
}

async function conjunto(s: S) {
  return await q<D>(db.from("conjuntos_conjuntos").select("*").eq("id", s.conjunto_id).single());
}

// Trae una fila verificando que pertenece al conjunto de la sesión.
async function uno(tabla: string, id: unknown, s: S, campos = "*") {
  if (!id) falla("Falta el identificador");
  const fila = await q<D | null>(db.from(tabla).select(campos).eq("id", String(id)).eq("conjunto_id", s.conjunto_id).maybeSingle());
  if (!fila) falla("No encontrado");
  return fila as D;
}

async function aplicarSaldos(conjunto_id: string) {
  const casas = await q<D[]>(db.from("conjuntos_casas").select("id").eq("conjunto_id", conjunto_id).gt("saldo_favor", 0));
  for (const c of casas) await q(db.rpc("conjuntos_aplicar_saldo", { p_casa: c.id }));
}

// ----------------------------------------------------------------------------- generar cobros
async function generarCobros(s: S, p: D, dry: boolean) {
  const conj = await conjunto(s);
  const periodo = periodoOk(p.periodo);
  const concepto = p.concepto_id ? await uno("conjuntos_conceptos", p.concepto_id, s) : null;
  const reparto = txt(p.reparto ?? concepto?.reparto, 20);
  if (!REPARTOS.includes(reparto)) falla("Forma de reparto no válida");
  const nombre = txt(p.nombre || concepto?.nombre, 80);
  if (!nombre) falla("Escribe el nombre del cobro");
  const monto = plata(p.monto ?? concepto?.monto) ?? 0;
  const detalle: D = p.detalle ?? concepto?.detalle ?? {};
  const vence = fechaOk(p.vence) ?? `${periodo}-${String(conj.dia_vence).padStart(2, "0")}`;

  const casas = await q<D[]>(db.from("conjuntos_casas").select("id,codigo,coeficiente")
    .eq("conjunto_id", s.conjunto_id).eq("activa", true).order("codigo"));
  if (!casas.length) falla("No hay casas activas. Crea las casas primero.");

  const igual = (lista: D[], total: number) => {
    if (!lista.length) falla("No hay casas seleccionadas");
    const base = Math.floor(total / lista.length);
    let resto = Math.round(total - base * lista.length);
    return lista.map((c) => ({ casa_id: c.id, codigo: c.codigo, monto: base + (resto-- > 0 ? 1 : 0) }));
  };

  let filas: { casa_id: string; codigo: string; monto: number }[] = [];
  if (reparto === "igual") {
    if (monto <= 0) falla("Escribe el valor total a repartir");
    filas = igual(casas, monto);
  } else if (reparto === "fijo") {
    if (monto <= 0) falla("Escribe el valor que paga cada casa");
    filas = casas.map((c) => ({ casa_id: c.id, codigo: c.codigo, monto }));
  } else if (reparto === "coeficiente") {
    if (monto <= 0) falla("Escribe el valor total a repartir");
    const suma = casas.reduce((a, c) => a + Number(c.coeficiente || 0), 0);
    if (suma <= 0) falla("Las casas no tienen coeficiente. Ponlo en Casas o usa otra forma de reparto.");
    filas = casas.map((c) => ({ casa_id: c.id, codigo: c.codigo, monto: Math.round(monto * Number(c.coeficiente || 0) / suma) }));
  } else if (reparto === "seleccion") {
    if (monto <= 0) falla("Escribe el valor");
    const ids = new Set((Array.isArray(detalle.casas) ? detalle.casas : []).map(String));
    const elegidas = casas.filter((c) => ids.has(c.id));
    filas = detalle.cada ? elegidas.map((c) => ({ casa_id: c.id, codigo: c.codigo, monto })) : igual(elegidas, monto);
    if (!filas.length) falla("Selecciona al menos una casa");
  } else {
    const m = (detalle.montos && typeof detalle.montos === "object") ? detalle.montos : {};
    filas = casas.filter((c) => Number(m[c.id]) > 0).map((c) => ({ casa_id: c.id, codigo: c.codigo, monto: Math.round(Number(m[c.id])) }));
    if (!filas.length) falla("Escribe el valor de al menos una casa");
  }
  filas = filas.filter((f) => f.monto > 0);

  let omitidas = 0;
  if (concepto) {
    const ya = await q<D[]>(db.from("conjuntos_cobros").select("casa_id").eq("concepto_id", concepto.id).eq("periodo", periodo));
    const set = new Set(ya.map((x) => x.casa_id));
    const antes = filas.length;
    filas = filas.filter((f) => !set.has(f.casa_id));
    omitidas = antes - filas.length;
  }
  const total = filas.reduce((a, f) => a + f.monto, 0);
  if (dry) return { nombre, periodo, vence, reparto, filas, total, omitidas };
  if (!filas.length) return { nombre, creados: 0, total: 0, omitidas };

  const ins = filas.map((f) => ({
    conjunto_id: s.conjunto_id, casa_id: f.casa_id, concepto_id: concepto?.id ?? null,
    periodo, descripcion: nombre, monto: f.monto, vence,
  }));
  for (let i = 0; i < ins.length; i += 500) await q(db.from("conjuntos_cobros").insert(ins.slice(i, i + 500)));
  await aplicarSaldos(s.conjunto_id);
  return { nombre, creados: filas.length, total, omitidas };
}

// ----------------------------------------------------------------------------- pases QR
// Residente: "CJR.<id>.<ventana>.<firma>" cambia cada 30 s; una captura de pantalla deja de servir en ~2 min.
// Invitado: código aleatorio de 14 dígitos guardado en conjuntos_visitas.pase_codigo.
const SECRETO_PASE = Deno.env.get("PASE_SECRETO") ?? (CLAVE_CREADOR + ":pase-006");
const VENTANA_QR = 30000;
const MAX_RESIDENTES = 15, MAX_PASES_ACTIVOS = 60;
const fechaCol = (ms: number) => new Date(ms - 5 * 3600e3).toISOString().slice(0, 10);
async function firmaResidente(id: string, t: number) { return (await sha256(SECRETO_PASE + ":" + id + ":" + t)).slice(0, 20); }
function codigoPase() {
  const a = crypto.getRandomValues(new Uint32Array(2));
  return String(1000000 + (a[0] % 9000000)) + String(a[1] % 10000000).padStart(7, "0");
}

async function revisarPase(codigoCrudo: unknown, s: S): Promise<D> {
  const crudo = txt(codigoCrudo, 200);
  if (!crudo) falla("Escanea o escribe el código del pase");
  const ahora = Date.now();

  if (crudo.startsWith("CJR.")) {
    const [, id, tTxt, firma] = crudo.split(".");
    const t = Number(tTxt);
    if (!id || !Number.isInteger(t) || !firma || firma !== await firmaResidente(id, t)) {
      return { ok: false, clase: "residente", motivo: "Código falso o alterado", datos: null };
    }
    const r = await q<D | null>(db.from("conjuntos_residentes").select("*").eq("id", id).eq("conjunto_id", s.conjunto_id).maybeSingle());
    if (!r) return { ok: false, clase: "residente", motivo: "Este QR no es de este conjunto", datos: null };
    const casa = await q<D | null>(db.from("conjuntos_casas").select("codigo,propietario,activa").eq("id", r.casa_id).maybeSingle());
    const datos = { id: r.id, nombre: r.nombre, documento: r.documento, placa: r.placa, casa: casa?.codigo, propietario: casa?.propietario, adentro: r.adentro, mov_at: r.mov_at };
    const actual = Math.floor(ahora / VENTANA_QR);
    if (t > actual + 1 || t < actual - 4) {
      return { ok: false, clase: "residente", motivo: "QR vencido: parece una captura de pantalla. Pídele que abra su QR en el celular.", datos };
    }
    if (!r.activo || casa?.activa === false) return { ok: false, clase: "residente", motivo: "Esta persona fue retirada de la casa", datos };
    return { ok: true, clase: "residente", accion: r.adentro ? "salida" : "entrada", datos };
  }

  const codigo = soloDigitos(crudo, 20);
  if (codigo.length < 10) return { ok: false, clase: "invitado", motivo: "Ese código no es un pase de este sistema", datos: null };
  const v = await q<D | null>(db.from("conjuntos_visitas").select("*").eq("pase_codigo", codigo).eq("conjunto_id", s.conjunto_id).maybeSingle());
  if (!v) return { ok: false, clase: "invitado", motivo: "Pase no encontrado en este conjunto", datos: null };
  const casa = await q<D | null>(db.from("conjuntos_casas").select("codigo,propietario").eq("id", v.casa_id).maybeSingle());
  const datos = {
    id: v.id, nombre: v.nombre, documento: v.documento, placa: v.placa, tipo: v.tipo, nota: v.nota, estado: v.estado,
    casa: casa?.codigo, propietario: casa?.propietario, desde: v.valido_desde, hasta: v.valido_hasta,
    entradas: v.entradas || 0, ingreso_at: v.ingreso_at, salida_at: v.salida_at,
  };
  const no = (motivo: string) => ({ ok: false, clase: "invitado", motivo, datos });
  if (v.estado === "adentro") return { ok: true, clase: "invitado", accion: "salida", datos };
  if (v.estado === "cancelado") return no("La casa canceló este pase");
  if (v.estado === "rechazado") return no("Este pase no fue autorizado");
  if (v.estado === "salio") return no("Este pase ya se usó y su plazo terminó");
  if (v.valido_desde && ahora < Date.parse(v.valido_desde)) return no("Todavía no es válido");
  if (v.valido_hasta && ahora > Date.parse(v.valido_hasta)) return no("El plazo del pase venció");
  return { ok: true, clase: "invitado", accion: "entrada", datos };
}

// ----------------------------------------------------------------------------- operaciones
type Fn = (d: D, s: S) => Promise<unknown>;
const CR = ["creador"], AD = ["admin"], CA = ["casa"], GU = ["guardia"];

const OPS: Record<string, [string[] | null, Fn]> = {
  // =================================================================== públicas
  login: [null, async (d) => {
    const usuario = txt(d.usuario, 40).toLowerCase().replace(/\s+/g, "");
    const clave = String(d.clave ?? "");
    await sleep(300);
    const u = await q<D | null>(db.from("conjuntos_usuarios").select("*").eq("usuario", usuario).maybeSingle());
    if (!u || !(await verificarClave(clave, u.clave_hash))) falla("Usuario o clave incorrectos");
    if (u!.estado !== "activo") falla("Tu usuario está bloqueado. Habla con la administración.");
    const c = await q<D | null>(db.from("conjuntos_conjuntos").select("nombre,estado,vence").eq("id", u!.conjunto_id).maybeSingle());
    const bloqueo = bloqueoConjunto(c);
    if (bloqueo) falla(bloqueo);
    await db.from("conjuntos_sesiones").delete().lt("expira", new Date().toISOString());
    await db.from("conjuntos_usuarios").update({ ultimo_acceso: new Date().toISOString() }).eq("id", u!.id);
    const token = await crearSesion(u!.id, u!.rol, u!.conjunto_id, u!.rol === "admin" ? 30 : 120);
    return { token, rol: u!.rol, nombre: u!.nombre || u!.usuario, conjunto: c!.nombre };
  }],

  creador_login: [null, async (d) => {
    await sleep(400);
    if (String(d.clave ?? "") !== CLAVE_CREADOR) falla("Clave incorrecta");
    return { token: await crearSesion(null, "creador", null, 1), rol: "creador", nombre: "Creador", conjunto: "" };
  }],

  logout: [null, async (d) => {
    if (typeof d.token === "string") await db.from("conjuntos_sesiones").delete().eq("token_hash", await sha256(d.token));
    return true;
  }],

  yo: [["admin", "casa", "guardia", "creador"], async (_d, s) => {
    if (s.rol === "creador") return { rol: "creador", nombre: "Creador", conjunto: "" };
    const c = await conjunto(s);
    return { rol: s.rol, nombre: s.nombre, conjunto: c.nombre };
  }],

  // =================================================================== creador (tú)
  cr_listar: [CR, async () => {
    const lista = await q<D[]>(db.from("conjuntos_conjuntos")
      .select("id,nombre,ciudad,telefono,plan_mensual,vence,estado,creado_at,conjuntos_casas(count)").order("creado_at", { ascending: false }));
    const admins = await q<D[]>(db.from("conjuntos_usuarios").select("conjunto_id,usuario,nombre,ultimo_acceso").eq("rol", "admin"));
    return lista.map((c) => ({
      ...c, casas: c.conjuntos_casas?.[0]?.count ?? 0, conjuntos_casas: undefined,
      admins: admins.filter((a) => a.conjunto_id === c.id),
    }));
  }],

  cr_crear: [CR, async (d) => {
    const nombre = txt(d.nombre, 100);
    if (nombre.length < 3) falla("Escribe el nombre del conjunto");
    const usuario = usuarioOk(d.admin_usuario);
    const clave = claveOk(d.admin_clave);
    const existe = await q<D | null>(db.from("conjuntos_usuarios").select("id").eq("usuario", usuario).maybeSingle());
    if (existe) falla("Ese usuario ya existe, elige otro");
    const meses = Math.max(0, Math.min(36, Math.round(num(d.meses) ?? 1)));
    const c = await q<D>(db.from("conjuntos_conjuntos").insert({
      nombre, ciudad: txt(d.ciudad, 60) || null, telefono: soloDigitos(d.telefono) || null,
      plan_mensual: plata(d.plan_mensual) ?? 0, vence: meses ? sumarMeses(hoy(), meses) : null,
    }).select("id").single());
    await q(db.from("conjuntos_usuarios").insert({
      conjunto_id: c.id, rol: "admin", usuario, nombre: txt(d.admin_nombre, 80) || "Administración",
      clave_hash: await hashClave(clave),
    }));
    return { id: c.id, usuario };
  }],

  cr_editar: [CR, async (d) => {
    const cambios: D = {};
    if (d.nombre !== undefined) cambios.nombre = txt(d.nombre, 100) || falla("Nombre vacío");
    if (d.ciudad !== undefined) cambios.ciudad = txt(d.ciudad, 60) || null;
    if (d.telefono !== undefined) cambios.telefono = soloDigitos(d.telefono) || null;
    if (d.plan_mensual !== undefined) cambios.plan_mensual = plata(d.plan_mensual) ?? 0;
    if (d.vence !== undefined) cambios.vence = fechaOk(d.vence);
    if (d.estado !== undefined) cambios.estado = d.estado === "suspendido" ? "suspendido" : "activo";
    await q(db.from("conjuntos_conjuntos").update(cambios).eq("id", txt(d.id, 40)));
    return true;
  }],

  cr_renovar: [CR, async (d) => {
    const c = await q<D>(db.from("conjuntos_conjuntos").select("vence").eq("id", txt(d.id, 40)).single());
    const meses = Math.max(1, Math.min(36, Math.round(num(d.meses) ?? 1)));
    const base = c.vence && c.vence > hoy() ? c.vence : hoy();
    const vence = sumarMeses(base, meses);
    await q(db.from("conjuntos_conjuntos").update({ vence, estado: "activo" }).eq("id", txt(d.id, 40)));
    return { vence };
  }],

  cr_admin_clave: [CR, async (d) => {
    const conjunto_id = txt(d.conjunto_id, 40);
    const usuario = usuarioOk(d.usuario);
    const clave = claveOk(d.clave);
    const u = await q<D | null>(db.from("conjuntos_usuarios").select("id,conjunto_id").eq("usuario", usuario).maybeSingle());
    if (u && u.conjunto_id !== conjunto_id) falla("Ese usuario pertenece a otro conjunto");
    if (u) {
      await q(db.from("conjuntos_usuarios").update({ clave_hash: await hashClave(clave), estado: "activo", rol: "admin", casa_id: null }).eq("id", u.id));
      await db.from("conjuntos_sesiones").delete().eq("usuario_id", u.id);
    } else {
      await q(db.from("conjuntos_usuarios").insert({ conjunto_id, rol: "admin", usuario, nombre: "Administración", clave_hash: await hashClave(clave) }));
    }
    return true;
  }],

  cr_borrar: [CR, async (d) => {
    const c = await q<D>(db.from("conjuntos_conjuntos").select("id,nombre").eq("id", txt(d.id, 40)).single());
    if (txt(d.confirmar, 100) !== c.nombre) falla("Escribe el nombre exacto del conjunto para confirmar");
    await db.from("conjuntos_sesiones").delete().eq("conjunto_id", c.id);
    await q(db.from("conjuntos_conjuntos").delete().eq("id", c.id));
    return true;
  }],

  // Datos de pago del creador: públicos a propósito para que un conjunto vencido sepa cómo renovar.
  pago_plataforma: [null, async () => await plataforma()],

  cr_plataforma: [CR, async () => await plataforma()],

  cr_plataforma_guardar: [CR, async (d) => {
    let qr: string | null | undefined = undefined;
    if (d.qr === null || d.qr === "") qr = null;
    else if (typeof d.qr === "string") {
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d.qr)) falla("La imagen del QR no es válida");
      if (d.qr.length > 450000) falla("La imagen del QR es muy pesada");
      qr = d.qr;
    }
    const cambios: D = {
      titular: txt(d.titular, 100) || null, nequi: soloDigitos(d.nequi) || null, daviplata: soloDigitos(d.daviplata) || null,
      llave: txt(d.llave, 60) || null, banco: txt(d.banco, 160) || null, whatsapp: soloDigitos(d.whatsapp) || null,
      horario: txt(d.horario, 120) || null, notas: txt(d.notas, 500) || null, actualizado_at: new Date().toISOString(),
    };
    if (qr !== undefined) cambios.qr = qr;
    await q(db.from("conjuntos_plataforma").upsert({ id: 1, ...cambios }));
    return true;
  }],

  cr_sus_pagos: [CR, async () => {
    const lista = await q<D[]>(db.from("conjuntos_suscripcion_pagos")
      .select("*,conjuntos_conjuntos(nombre,vence,plan_mensual)").order("creado_at", { ascending: false }).limit(400));
    return lista.map((p) => ({ ...p, conjunto: p.conjuntos_conjuntos?.nombre ?? "—", vence: p.conjuntos_conjuntos?.vence ?? null, conjuntos_conjuntos: undefined }));
  }],

  cr_sus_pago_revisar: [CR, async (d) => {
    const p = await q<D | null>(db.from("conjuntos_suscripcion_pagos").select("*").eq("id", txt(d.id, 40)).maybeSingle());
    if (!p) falla("Pago no encontrado");
    if (p!.estado !== "por_validar") falla("Ese pago ya fue revisado");
    const aprobar = d.aprobar === true;
    let vence: string | null = null;
    if (aprobar) {
      const c = await q<D>(db.from("conjuntos_conjuntos").select("vence").eq("id", p!.conjunto_id).single());
      const base = c.vence && c.vence > hoy() ? c.vence : hoy();
      vence = sumarMeses(base, Number(p!.meses));
      await q(db.from("conjuntos_conjuntos").update({ vence, estado: "activo" }).eq("id", p!.conjunto_id));
    }
    await q(db.from("conjuntos_suscripcion_pagos").update({
      estado: aprobar ? "aprobado" : "rechazado", respuesta: txt(d.respuesta, 300) || null, revisado_at: new Date().toISOString(),
    }).eq("id", p!.id).eq("estado", "por_validar"));
    return { vence };
  }],

  // =================================================================== administrador del conjunto
  adm_suscripcion: [AD, async (_d, s) => {
    const c = await conjunto(s);
    const pagos = await q<D[]>(db.from("conjuntos_suscripcion_pagos").select("id,meses,monto,referencia,nota,estado,respuesta,creado_at,revisado_at")
      .eq("conjunto_id", s.conjunto_id).order("creado_at", { ascending: false }).limit(60));
    return {
      conjunto: { nombre: c.nombre, vence: c.vence, plan_mensual: c.plan_mensual, estado: c.estado, creado_at: c.creado_at },
      dias_gracia: DIAS_GRACIA, hoy: hoy(), plataforma: await plataforma(), pagos,
    };
  }],

  adm_sus_reportar: [AD, async (d, s) => {
    const c = await conjunto(s);
    const meses = Math.max(1, Math.min(12, Math.round(num(d.meses) ?? 1)));
    const referencia = txt(d.referencia, 80);
    if (referencia.length < 3) falla("Escribe la referencia o número de la transacción");
    const pendiente = await q<D | null>(db.from("conjuntos_suscripcion_pagos").select("id")
      .eq("conjunto_id", s.conjunto_id).eq("estado", "por_validar").limit(1).maybeSingle());
    if (pendiente) falla("Ya tienes un pago esperando revisión. Te avisamos apenas se confirme.");
    await q(db.from("conjuntos_suscripcion_pagos").insert({
      conjunto_id: s.conjunto_id, meses, monto: Number(c.plan_mensual || 0) * meses, referencia, nota: txt(d.nota, 300) || null,
    }));
    return { meses, monto: Number(c.plan_mensual || 0) * meses };
  }],

  adm_resumen: [AD, async (d, s) => {
    const periodo = periodoOk(d.periodo);
    const m = await q<D>(db.rpc("conjuntos_metricas", { p_conjunto: s.conjunto_id, p_periodo: periodo }));
    const c = await conjunto(s);
    return { periodo, metricas: m, conjunto: { nombre: c.nombre, vence: c.vence, plan_mensual: c.plan_mensual } };
  }],

  adm_conjunto: [AD, async (_d, s) => await conjunto(s)],

  adm_conjunto_guardar: [AD, async (d, s) => {
    const modo = d.comprobante_modo === "referencia" ? "referencia" : "whatsapp";
    const wa = soloDigitos(d.whatsapp_comprobantes);
    if (modo === "whatsapp" && wa.length < 10) falla("Escribe el WhatsApp que recibirá los comprobantes (10 dígitos)");
    const extra: D = {};
    if (d.pago_qr === null || d.pago_qr === "") extra.pago_qr = null;
    else if (typeof d.pago_qr === "string") {
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d.pago_qr)) falla("La imagen de pago no es válida");
      if (d.pago_qr.length > 450000) falla("La imagen de pago es muy pesada");
      extra.pago_qr = d.pago_qr;
    }
    await q(db.from("conjuntos_conjuntos").update({
      ...extra,
      nombre: txt(d.nombre, 100) || falla("Nombre vacío"),
      ciudad: txt(d.ciudad, 60) || null, direccion: txt(d.direccion, 160) || null, nit: txt(d.nit, 30) || null,
      telefono: soloDigitos(d.telefono) || null, whatsapp_comprobantes: wa || null, comprobante_modo: modo,
      pago_nequi: soloDigitos(d.pago_nequi) || null, pago_daviplata: soloDigitos(d.pago_daviplata) || null,
      pago_llave: txt(d.pago_llave, 60) || null, pago_banco: txt(d.pago_banco, 160) || null,
      pago_titular: txt(d.pago_titular, 100) || null, pago_notas: txt(d.pago_notas, 400) || null,
      dia_vence: Math.max(1, Math.min(28, Math.round(num(d.dia_vence) ?? 10))),
      mora_pct: Math.max(0, Math.min(10, num(d.mora_pct) ?? 0)),
    }).eq("id", s.conjunto_id));
    return true;
  }],

  // ---------------------------------------------------- casas
  adm_casas: [AD, async (d, s) => {
    const periodo = periodoOk(d.periodo);
    const casas = await todos((a, b) => db.from("conjuntos_casas").select("*").eq("conjunto_id", s.conjunto_id).order("codigo").range(a, b));
    const saldos = await q<D[]>(db.rpc("conjuntos_saldos", { p_conjunto: s.conjunto_id, p_periodo: periodo }));
    const usuarios = await q<D[]>(db.from("conjuntos_usuarios").select("casa_id,usuario,estado").eq("conjunto_id", s.conjunto_id).eq("rol", "casa"));
    const porCasa = new Map(saldos.map((x) => [x.casa_id, x]));
    return {
      periodo,
      casas: casas.map((c) => {
        const x = porCasa.get(c.id) || {};
        const cobrado = Number(x.cobrado_mes || 0), pagado = Number(x.pagado_mes || 0);
        const estado_mes = cobrado <= 0 ? "sin_cobro" : pagado >= cobrado ? "pagado" : pagado > 0 ? "parcial" : "pendiente";
        return {
          ...c, deuda: Number(x.deuda || 0), vencido: Number(x.vencido || 0), cobrado_mes: cobrado, pagado_mes: pagado, estado_mes,
          usuarios: usuarios.filter((u) => u.casa_id === c.id).map((u) => ({ usuario: u.usuario, estado: u.estado })),
        };
      }),
    };
  }],

  adm_casa_guardar: [AD, async (d, s) => {
    const fila: D = {
      codigo: txt(d.codigo, 30) || falla("Escribe el código de la casa (ej: Casa 12, T2-301)"),
      propietario: txt(d.propietario, 100) || null, telefono: soloDigitos(d.telefono) || null,
      correo: txt(d.correo, 120) || null, coeficiente: Math.max(0, num(d.coeficiente) ?? 0),
      notas: txt(d.notas, 400) || null, activa: d.activa !== false,
    };
    let id = txt(d.id, 40);
    if (id) {
      await uno("conjuntos_casas", id, s, "id");
      await q(db.from("conjuntos_casas").update(fila).eq("id", id));
    } else {
      const c = await q<D>(db.from("conjuntos_casas").insert({ ...fila, conjunto_id: s.conjunto_id }).select("id").single());
      id = c.id;
    }
    if (d.usuario && d.clave) {
      await q(db.from("conjuntos_usuarios").insert({
        conjunto_id: s.conjunto_id, casa_id: id, rol: "casa", usuario: usuarioOk(d.usuario),
        nombre: fila.propietario || fila.codigo, clave_hash: await hashClave(claveOk(d.clave)),
      }));
    }
    return { id };
  }],

  adm_casa_borrar: [AD, async (d, s) => {
    const c = await uno("conjuntos_casas", d.id, s, "id");
    const { count } = await db.from("conjuntos_pagos").select("id", { count: "exact", head: true }).eq("casa_id", c.id);
    if ((count || 0) > 0) falla("Esta casa ya tiene pagos registrados. Desactívala en vez de borrarla.");
    await q(db.from("conjuntos_casas").delete().eq("id", c.id));
    return true;
  }],

  // texto: una casa por línea -> codigo;propietario;telefono;coeficiente;usuario;clave
  adm_casas_importar: [AD, async (d, s) => {
    const lineas = String(d.texto ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 2000);
    if (!lineas.length) falla("Pega al menos una línea");
    const existentes = await todos((a, b) => db.from("conjuntos_casas").select("id,codigo").eq("conjunto_id", s.conjunto_id).range(a, b));
    const mapa = new Map(existentes.map((c) => [c.codigo.toLowerCase(), c.id]));
    let creadas = 0, actualizadas = 0, usuarios = 0;
    const errores: string[] = [];
    for (const [i, l] of lineas.entries()) {
      const [codigo, propietario, telefono, coef, usuario, clave] = l.split(/[;\t|]/).map((x) => x.trim());
      if (!codigo) continue;
      try {
        const fila: D = { codigo: codigo.slice(0, 30) };
        if (propietario) fila.propietario = propietario.slice(0, 100);
        if (telefono) fila.telefono = soloDigitos(telefono);
        if (coef) fila.coeficiente = Math.max(0, Number(coef.replace(",", ".")) || 0);
        let id = mapa.get(codigo.toLowerCase());
        if (id) { await q(db.from("conjuntos_casas").update(fila).eq("id", id)); actualizadas++; }
        else {
          const c = await q<D>(db.from("conjuntos_casas").insert({ ...fila, conjunto_id: s.conjunto_id }).select("id").single());
          id = c.id; mapa.set(codigo.toLowerCase(), id!); creadas++;
        }
        if (usuario && clave) {
          await q(db.from("conjuntos_usuarios").insert({
            conjunto_id: s.conjunto_id, casa_id: id, rol: "casa", usuario: usuarioOk(usuario),
            nombre: propietario || codigo, clave_hash: await hashClave(claveOk(clave)),
          }));
          usuarios++;
        }
      } catch (e) {
        errores.push(`Línea ${i + 1} (${codigo}): ${(e as Error).message}`);
      }
    }
    return { creadas, actualizadas, usuarios, errores: errores.slice(0, 30) };
  }],

  // Crea usuario y clave a cada casa que todavía no tenga. Devuelve la lista para compartir UNA vez.
  adm_casas_usuarios_auto: [AD, async (d, s) => {
    const conj = await conjunto(s);
    const prefijo = slug(txt(d.prefijo, 20) || conj.nombre).slice(0, 14) || "casa";
    const casas = await todos((a, b) => db.from("conjuntos_casas").select("id,codigo,propietario,telefono").eq("conjunto_id", s.conjunto_id).eq("activa", true).order("codigo").range(a, b));
    const conUsuario = new Set((await q<D[]>(db.from("conjuntos_usuarios").select("casa_id").eq("conjunto_id", s.conjunto_id).eq("rol", "casa"))).map((u) => u.casa_id));
    const creados: D[] = [];
    for (const c of casas.filter((x) => !conUsuario.has(x.id))) {
      let usuario = `${prefijo}-${slug(c.codigo)}`.slice(0, 40);
      const ya = await q<D | null>(db.from("conjuntos_usuarios").select("id").eq("usuario", usuario).maybeSingle());
      if (ya) usuario = `${usuario.slice(0, 34)}-${claveAleatoria().slice(0, 4)}`;
      const clave = claveAleatoria();
      await q(db.from("conjuntos_usuarios").insert({
        conjunto_id: s.conjunto_id, casa_id: c.id, rol: "casa", usuario, nombre: c.propietario || c.codigo,
        clave_hash: await hashClave(clave),
      }));
      creados.push({ codigo: c.codigo, propietario: c.propietario, telefono: c.telefono, usuario, clave });
    }
    return { creados };
  }],

  adm_estado_casa: [AD, async (d, s) => {
    const casa = await uno("conjuntos_casas", d.casa_id, s);
    const cobros = await q<D[]>(db.from("conjuntos_cobros").select("*").eq("casa_id", casa.id).order("periodo", { ascending: false }).limit(300));
    const pagos = await q<D[]>(db.from("conjuntos_pagos").select("*").eq("casa_id", casa.id).order("creado_at", { ascending: false }).limit(200));
    return { casa, cobros, pagos };
  }],

  // ---------------------------------------------------- servicios (conceptos)
  adm_conceptos: [AD, async (_d, s) =>
    await q(db.from("conjuntos_conceptos").select("*").eq("conjunto_id", s.conjunto_id).order("nombre"))],

  adm_concepto_guardar: [AD, async (d, s) => {
    const reparto = txt(d.reparto, 20);
    if (!REPARTOS.includes(reparto)) falla("Forma de reparto no válida");
    const detalle: D = {};
    if (reparto === "seleccion") { detalle.casas = Array.isArray(d.detalle?.casas) ? d.detalle.casas.map(String).slice(0, 3000) : []; detalle.cada = !!d.detalle?.cada; }
    if (reparto === "manual") {
      detalle.montos = {};
      for (const [k, v] of Object.entries(d.detalle?.montos || {})) { const n = plata(v); if (n) detalle.montos[k] = n; }
    }
    const fila = {
      nombre: txt(d.nombre, 80) || falla("Escribe el nombre del servicio"), reparto,
      monto: plata(d.monto) ?? 0, detalle, recurrente: d.recurrente !== false, activo: d.activo !== false,
    };
    if (d.id) {
      await uno("conjuntos_conceptos", d.id, s, "id");
      await q(db.from("conjuntos_conceptos").update(fila).eq("id", d.id));
      return { id: d.id };
    }
    const c = await q<D>(db.from("conjuntos_conceptos").insert({ ...fila, conjunto_id: s.conjunto_id }).select("id").single());
    return { id: c.id };
  }],

  adm_concepto_borrar: [AD, async (d, s) => {
    const c = await uno("conjuntos_conceptos", d.id, s, "id");
    await q(db.from("conjuntos_conceptos").delete().eq("id", c.id));
    return true;
  }],

  // ---------------------------------------------------- cobros
  adm_generar: [AD, async (d, s) => await generarCobros(s, d, d.preview === true)],

  // Genera de una vez todos los servicios recurrentes activos del periodo (no duplica).
  adm_generar_mes: [AD, async (d, s) => {
    const conceptos = await q<D[]>(db.from("conjuntos_conceptos").select("*").eq("conjunto_id", s.conjunto_id).eq("activo", true).eq("recurrente", true).order("nombre"));
    if (!conceptos.length) falla("No tienes servicios recurrentes activos. Créalos en la pestaña Servicios.");
    const resultado: D[] = [];
    for (const c of conceptos) {
      try {
        const r = await generarCobros(s, { concepto_id: c.id, periodo: d.periodo, vence: d.vence }, d.preview === true) as D;
        resultado.push({ nombre: c.nombre, casas: r.creados ?? r.filas?.length ?? 0, total: r.total, omitidas: r.omitidas });
      } catch (e) {
        resultado.push({ nombre: c.nombre, error: (e as Error).message });
      }
    }
    return { periodo: periodoOk(d.periodo), resultado };
  }],

  // Intereses de mora sobre lo vencido (una vez por periodo y por casa).
  adm_aplicar_mora: [AD, async (d, s) => {
    const conj = await conjunto(s);
    const pct = Number(conj.mora_pct || 0);
    if (pct <= 0) falla("Primero define el % de interés de mora en Ajustes");
    const periodo = periodoOk(d.periodo);
    const nombre = "Interés de mora";
    const vencidos = await todos((a, b) => db.from("conjuntos_cobros").select("casa_id,monto,pagado,descripcion")
      .eq("conjunto_id", s.conjunto_id).lt("vence", hoy()).range(a, b));
    const porCasa = new Map<string, number>();
    for (const c of vencidos) {
      if (c.descripcion === nombre) continue;
      const falta = Number(c.monto) - Number(c.pagado);
      if (falta > 0) porCasa.set(c.casa_id, (porCasa.get(c.casa_id) || 0) + falta);
    }
    const ya = new Set((await q<D[]>(db.from("conjuntos_cobros").select("casa_id").eq("conjunto_id", s.conjunto_id).eq("periodo", periodo).eq("descripcion", nombre))).map((x) => x.casa_id));
    const filas = [...porCasa.entries()].filter(([id]) => !ya.has(id))
      .map(([casa_id, deuda]) => ({ conjunto_id: s.conjunto_id, casa_id, periodo, descripcion: nombre, monto: Math.round(deuda * pct / 100), vence: sumarDias(hoy(), 10) }))
      .filter((f) => f.monto > 0);
    if (d.preview === true) return { casas: filas.length, total: filas.reduce((a, f) => a + f.monto, 0) };
    if (filas.length) await q(db.from("conjuntos_cobros").insert(filas));
    return { casas: filas.length, total: filas.reduce((a, f) => a + f.monto, 0) };
  }],

  adm_cobros: [AD, async (d, s) => {
    const periodo = d.periodo ? periodoOk(d.periodo) : null;
    const filas = await todos((a, b) => {
      let x = db.from("conjuntos_cobros").select("*").eq("conjunto_id", s.conjunto_id);
      if (periodo) x = x.eq("periodo", periodo);
      if (d.casa_id) x = x.eq("casa_id", String(d.casa_id));
      return x.order("creado_at", { ascending: false }).range(a, b);
    });
    return filas;
  }],

  adm_cobro_editar: [AD, async (d, s) => {
    const c = await uno("conjuntos_cobros", d.id, s);
    const monto = plata(d.monto) ?? falla("Valor no válido");
    if (monto! < Number(c.pagado)) falla("El valor no puede ser menor a lo que ya se pagó (" + c.pagado + ")");
    await q(db.from("conjuntos_cobros").update({
      monto, descripcion: txt(d.descripcion, 80) || c.descripcion, vence: fechaOk(d.vence) ?? c.vence,
    }).eq("id", c.id));
    return true;
  }],

  adm_cobro_borrar: [AD, async (d, s) => {
    const c = await uno("conjuntos_cobros", d.id, s);
    if (Number(c.pagado) > 0) falla("Este cobro ya tiene pagos aplicados; edítalo en vez de borrarlo");
    await q(db.from("conjuntos_cobros").delete().eq("id", c.id));
    return true;
  }],

  // ---------------------------------------------------- pagos
  adm_pagos: [AD, async (d, s) => {
    const estado = txt(d.estado, 20);
    return await todos((a, b) => {
      let x = db.from("conjuntos_pagos").select("*").eq("conjunto_id", s.conjunto_id);
      if (["por_validar", "aprobado", "rechazado"].includes(estado)) x = x.eq("estado", estado);
      if (fechaOk(d.desde)) x = x.gte("creado_at", d.desde + "T00:00:00-05:00");
      if (fechaOk(d.hasta)) x = x.lte("creado_at", d.hasta + "T23:59:59-05:00");
      return x.order("creado_at", { ascending: false }).range(a, b);
    }, 4000);
  }],

  adm_pago_registrar: [AD, async (d, s) => {
    const casa = await uno("conjuntos_casas", d.casa_id, s, "id");
    const monto = plata(d.monto);
    if (!monto) falla("Escribe el valor del pago");
    const p = await q<D>(db.from("conjuntos_pagos").insert({
      conjunto_id: s.conjunto_id, casa_id: casa.id, monto, metodo: txt(d.metodo, 30) || "efectivo",
      referencia: txt(d.referencia, 80) || null, nota: txt(d.nota, 300) || null, reportado_por: "admin",
    }).select("id").single());
    const saldo = await q(db.rpc("conjuntos_aprobar_pago", { p_pago: p.id }));
    return { id: p.id, saldo_favor: saldo };
  }],

  adm_pago_validar: [AD, async (d, s) => {
    const p = await uno("conjuntos_pagos", d.id, s);
    if (p.estado !== "por_validar") falla("Este pago ya fue revisado");
    if (d.aprobar === true) {
      const saldo = await q(db.rpc("conjuntos_aprobar_pago", { p_pago: p.id }));
      return { estado: "aprobado", saldo_favor: saldo };
    }
    await q(db.from("conjuntos_pagos").update({ estado: "rechazado", motivo_rechazo: txt(d.motivo, 200) || null, validado_at: new Date().toISOString() }).eq("id", p.id));
    return { estado: "rechazado" };
  }],

  // ---------------------------------------------------- caja (otros ingresos / egresos)
  adm_movs: [AD, async (d, s) => await todos((a, b) => {
    let x = db.from("conjuntos_movimientos").select("*").eq("conjunto_id", s.conjunto_id);
    if (fechaOk(d.desde)) x = x.gte("fecha", d.desde);
    if (fechaOk(d.hasta)) x = x.lte("fecha", d.hasta);
    return x.order("fecha", { ascending: false }).order("creado_at", { ascending: false }).range(a, b);
  }, 4000)],

  adm_mov_guardar: [AD, async (d, s) => {
    const fila = {
      tipo: d.tipo === "ingreso" ? "ingreso" : "egreso",
      categoria: txt(d.categoria, 40) || "General",
      concepto: txt(d.concepto, 120) || falla("Escribe el concepto"),
      monto: plata(d.monto) || falla("Escribe el valor"),
      fecha: fechaOk(d.fecha) ?? hoy(), proveedor: txt(d.proveedor, 100) || null, nota: txt(d.nota, 300) || null,
    };
    if (d.id) {
      await uno("conjuntos_movimientos", d.id, s, "id");
      await q(db.from("conjuntos_movimientos").update(fila).eq("id", d.id));
      return { id: d.id };
    }
    const m = await q<D>(db.from("conjuntos_movimientos").insert({ ...fila, conjunto_id: s.conjunto_id }).select("id").single());
    return { id: m.id };
  }],

  adm_mov_borrar: [AD, async (d, s) => {
    const m = await uno("conjuntos_movimientos", d.id, s, "id");
    await q(db.from("conjuntos_movimientos").delete().eq("id", m.id));
    return true;
  }],

  // ---------------------------------------------------- portería (historial para admin)
  adm_porteria: [AD, async (d, s) => {
    const desde = fechaOk(d.desde) ?? sumarDias(hoy(), -30), hasta = fechaOk(d.hasta) ?? hoy();
    const visitas = await todos((a, b) => db.from("conjuntos_visitas").select("*").eq("conjunto_id", s.conjunto_id)
      .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).range(a, b), 4000);
    const paquetes = await todos((a, b) => db.from("conjuntos_paquetes").select("*").eq("conjunto_id", s.conjunto_id)
      .gte("recibido_at", desde + "T00:00:00-05:00").lte("recibido_at", hasta + "T23:59:59-05:00").order("recibido_at", { ascending: false }).range(a, b), 4000);
    return { visitas, paquetes };
  }],

  // ---------------------------------------------------- comunicados
  adm_comunicados: [AD, async (_d, s) =>
    await q(db.from("conjuntos_comunicados").select("*").eq("conjunto_id", s.conjunto_id).order("creado_at", { ascending: false }).limit(300))],

  adm_comunicado_guardar: [AD, async (d, s) => {
    const fila = {
      titulo: txt(d.titulo, 120) || falla("Escribe el título"),
      cuerpo: txt(d.cuerpo, 3000) || falla("Escribe el mensaje"),
      importante: d.importante === true,
    };
    if (d.id) {
      await uno("conjuntos_comunicados", d.id, s, "id");
      await q(db.from("conjuntos_comunicados").update(fila).eq("id", d.id));
      return true;
    }
    await q(db.from("conjuntos_comunicados").insert({ ...fila, conjunto_id: s.conjunto_id }));
    return true;
  }],

  adm_comunicado_borrar: [AD, async (d, s) => {
    const c = await uno("conjuntos_comunicados", d.id, s, "id");
    await q(db.from("conjuntos_comunicados").delete().eq("id", c.id));
    return true;
  }],

  // ---------------------------------------------------- usuarios
  adm_usuarios: [AD, async (_d, s) => {
    const us = await todos((a, b) => db.from("conjuntos_usuarios").select("id,rol,usuario,nombre,estado,casa_id,ultimo_acceso,creado_at")
      .eq("conjunto_id", s.conjunto_id).order("rol").order("usuario").range(a, b));
    const casas = await todos((a, b) => db.from("conjuntos_casas").select("id,codigo").eq("conjunto_id", s.conjunto_id).range(a, b));
    const cod = new Map(casas.map((c) => [c.id, c.codigo]));
    return us.map((u) => ({ ...u, casa: u.casa_id ? cod.get(u.casa_id) : null, yo: u.id === s.usuario_id }));
  }],

  adm_usuario_guardar: [AD, async (d, s) => {
    const rol = ["admin", "casa", "guardia"].includes(d.rol) ? d.rol : falla("Rol no válido");
    let casa_id: string | null = null;
    if (rol === "casa") casa_id = (await uno("conjuntos_casas", d.casa_id, s, "id")).id;
    const fila: D = { rol, casa_id, nombre: txt(d.nombre, 80) || null };
    if (d.id) {
      const u = await uno("conjuntos_usuarios", d.id, s, "id");
      if (d.usuario) fila.usuario = usuarioOk(d.usuario);
      if (d.clave) fila.clave_hash = await hashClave(claveOk(d.clave));
      if (u.id === s.usuario_id && rol !== "admin") falla("No puedes quitarte el rol de administrador");
      await q(db.from("conjuntos_usuarios").update(fila).eq("id", u.id));
      if (d.clave) await db.from("conjuntos_sesiones").delete().eq("usuario_id", u.id);
      return true;
    }
    await q(db.from("conjuntos_usuarios").insert({
      ...fila, conjunto_id: s.conjunto_id, usuario: usuarioOk(d.usuario), clave_hash: await hashClave(claveOk(d.clave)),
    }));
    return true;
  }],

  adm_usuario_estado: [AD, async (d, s) => {
    const u = await uno("conjuntos_usuarios", d.id, s, "id");
    if (u.id === s.usuario_id) falla("No puedes bloquearte a ti mismo");
    const estado = d.estado === "bloqueado" ? "bloqueado" : "activo";
    await q(db.from("conjuntos_usuarios").update({ estado }).eq("id", u.id));
    if (estado === "bloqueado") await db.from("conjuntos_sesiones").delete().eq("usuario_id", u.id);
    return true;
  }],

  adm_usuario_borrar: [AD, async (d, s) => {
    const u = await uno("conjuntos_usuarios", d.id, s, "id");
    if (u.id === s.usuario_id) falla("No puedes borrar tu propio usuario");
    await q(db.from("conjuntos_usuarios").delete().eq("id", u.id));
    return true;
  }],

  // =================================================================== casa (residente)
  casa_inicio: [CA, async (_d, s) => {
    const c = await conjunto(s);
    const casa = await q<D>(db.from("conjuntos_casas").select("id,codigo,propietario,saldo_favor").eq("id", s.casa_id).single());
    const pendientes = (await q<D[]>(db.from("conjuntos_cobros").select("*").eq("casa_id", s.casa_id).order("vence").limit(500)))
      .filter((x) => Number(x.pagado) < Number(x.monto));
    const pagos = await q<D[]>(db.from("conjuntos_pagos").select("*").eq("casa_id", s.casa_id).order("creado_at", { ascending: false }).limit(20));
    const comunicados = await q<D[]>(db.from("conjuntos_comunicados").select("*").eq("conjunto_id", s.conjunto_id).order("creado_at", { ascending: false }).limit(30));
    const paquetes = await q<D[]>(db.from("conjuntos_paquetes").select("*").eq("casa_id", s.casa_id).is("entregado_at", null).order("recibido_at", { ascending: false }));
    const deuda = pendientes.reduce((a, x) => a + Number(x.monto) - Number(x.pagado), 0);
    const vencido = pendientes.filter((x) => x.vence && x.vence < hoy()).reduce((a, x) => a + Number(x.monto) - Number(x.pagado), 0);
    return {
      conjunto: {
        nombre: c.nombre, whatsapp_comprobantes: c.whatsapp_comprobantes, comprobante_modo: c.comprobante_modo,
        pago_nequi: c.pago_nequi, pago_daviplata: c.pago_daviplata, pago_llave: c.pago_llave, pago_banco: c.pago_banco,
        pago_titular: c.pago_titular, pago_notas: c.pago_notas, pago_qr: c.pago_qr, nit: c.nit, direccion: c.direccion, ciudad: c.ciudad,
      },
      casa, deuda, vencido, pendientes, pagos, comunicados, paquetes,
      por_validar: pagos.filter((p) => p.estado === "por_validar").reduce((a, p) => a + Number(p.monto), 0),
    };
  }],

  casa_historial: [CA, async (_d, s) => ({
    cobros: await q(db.from("conjuntos_cobros").select("*").eq("casa_id", s.casa_id).order("periodo", { ascending: false }).limit(500)),
    pagos: await q(db.from("conjuntos_pagos").select("*").eq("casa_id", s.casa_id).order("creado_at", { ascending: false }).limit(300)),
  })],

  casa_reportar_pago: [CA, async (d, s) => {
    const monto = plata(d.monto);
    if (!monto) falla("Escribe el valor que pagaste");
    const { count } = await db.from("conjuntos_pagos").select("id", { count: "exact", head: true })
      .eq("casa_id", s.casa_id).eq("estado", "por_validar");
    if ((count || 0) >= 5) falla("Tienes 5 pagos esperando revisión. Espera a que la administración los valide.");
    const p = await q<D>(db.from("conjuntos_pagos").insert({
      conjunto_id: s.conjunto_id, casa_id: s.casa_id, monto, metodo: txt(d.metodo, 30) || "transferencia",
      referencia: txt(d.referencia, 80) || null, nota: txt(d.nota, 300) || null, reportado_por: "casa",
    }).select("*").single());
    return p;
  }],

  casa_visitas: [CA, async (_d, s) =>
    await q(db.from("conjuntos_visitas").select("*").eq("casa_id", s.casa_id).order("creado_at", { ascending: false }).limit(300))],

  casa_visita_crear: [CA, async (d, s) => {
    const fecha = fechaOk(d.fecha) ?? hoy();
    if (fecha < hoy()) falla("La fecha no puede ser en el pasado");
    let hasta = fechaOk(d.hasta);
    if (hasta && hasta < fecha) falla("La fecha 'hasta' debe ser después de la fecha de llegada");
    if (hasta && hasta > sumarDias(fecha, 366)) hasta = sumarDias(fecha, 366);
    const tipo = TIPOS_VISITA.includes(d.tipo) ? d.tipo : "visita";
    const v = await q<D>(db.from("conjuntos_visitas").insert({
      conjunto_id: s.conjunto_id, casa_id: s.casa_id, nombre: txt(d.nombre, 100) || falla("Escribe el nombre de quien llega"),
      documento: txt(d.documento, 20) || null, placa: txt(d.placa, 10).toUpperCase() || null, tipo, fecha, hasta,
      nota: txt(d.nota, 200) || null, estado: "esperado", creada_por: "casa",
    }).select("*").single());
    return v;
  }],

  casa_visita_cancelar: [CA, async (d, s) => {
    const v = await uno("conjuntos_visitas", d.id, s);
    if (v.casa_id !== s.casa_id) falla("No encontrado");
    if (!["esperado", "por_autorizar"].includes(v.estado)) falla("Esta visita ya no se puede cancelar");
    await q(db.from("conjuntos_visitas").update({ estado: "cancelado" }).eq("id", v.id));
    return true;
  }],

  casa_responder: [CA, async (d, s) => {
    const v = await uno("conjuntos_visitas", d.id, s);
    if (v.casa_id !== s.casa_id) falla("No encontrado");
    if (v.estado !== "por_autorizar") falla("Ya respondiste esta visita");
    await q(db.from("conjuntos_visitas").update({
      estado: d.autorizar === true ? "esperado" : "rechazado", respondido_at: new Date().toISOString(),
    }).eq("id", v.id));
    return true;
  }],

  // ------------------------------------------------------------- pases QR de la casa
  casa_residentes: [CA, async (_d, s) =>
    await q(db.from("conjuntos_residentes").select("id,nombre,documento,placa,adentro,mov_at").eq("casa_id", s.casa_id).eq("activo", true).order("creado_at"))],

  casa_residente_guardar: [CA, async (d, s) => {
    const fila = {
      nombre: txt(d.nombre, 100) || falla("Escribe el nombre"),
      documento: txt(d.documento, 20) || null, placa: txt(d.placa, 10).toUpperCase() || null,
    };
    if (d.id) {
      const r = await uno("conjuntos_residentes", d.id, s, "id,casa_id");
      if (r.casa_id !== s.casa_id) falla("No encontrado");
      return await q(db.from("conjuntos_residentes").update(fila).eq("id", r.id).select("*").single());
    }
    const { count } = await db.from("conjuntos_residentes").select("id", { count: "exact", head: true }).eq("casa_id", s.casa_id).eq("activo", true);
    if ((count || 0) >= MAX_RESIDENTES) falla("Máximo " + MAX_RESIDENTES + " personas por casa");
    return await q(db.from("conjuntos_residentes").insert({ conjunto_id: s.conjunto_id, casa_id: s.casa_id, ...fila }).select("*").single());
  }],

  casa_residente_borrar: [CA, async (d, s) => {
    const r = await uno("conjuntos_residentes", d.id, s, "id,casa_id");
    if (r.casa_id !== s.casa_id) falla("No encontrado");
    await q(db.from("conjuntos_residentes").delete().eq("id", r.id));
    return true;
  }],

  casa_residente_qr: [CA, async (d, s) => {
    const r = await uno("conjuntos_residentes", d.id, s, "id,casa_id,activo");
    if (r.casa_id !== s.casa_id || !r.activo) falla("No encontrado");
    const ahora = Date.now(), t = Math.floor(ahora / VENTANA_QR);
    return { codigo: "CJR." + r.id + "." + t + "." + await firmaResidente(r.id, t), restante: VENTANA_QR - (ahora % VENTANA_QR) };
  }],

  casa_pase_crear: [CA, async (d, s) => {
    const ahora = Date.now();
    const pedido = Date.parse(txt(d.desde, 40));
    const desde = Number.isFinite(pedido) && pedido > ahora ? pedido : ahora;
    if (desde > ahora + 90 * 86400e3) falla("El pase puede empezar máximo dentro de 90 días");
    const horas = Math.round(num(d.horas) ?? 24);
    if (horas < 1 || horas > 24 * 31) falla("El plazo debe ser entre 1 hora y 31 días");
    const hasta = desde + horas * 3600e3;
    const { count } = await db.from("conjuntos_visitas").select("id", { count: "exact", head: true })
      .eq("casa_id", s.casa_id).not("pase_codigo", "is", null).in("estado", ["esperado", "adentro"]).gt("valido_hasta", new Date(ahora).toISOString());
    if ((count || 0) >= MAX_PASES_ACTIVOS) falla("Tienes demasiados pases activos. Cancela los que ya no uses.");
    const fila = {
      conjunto_id: s.conjunto_id, casa_id: s.casa_id, nombre: txt(d.nombre, 100) || falla("Escribe el nombre del invitado"),
      documento: txt(d.documento, 20) || null, placa: txt(d.placa, 10).toUpperCase() || null,
      telefono: soloDigitos(d.telefono, 15) || null, tipo: TIPOS_VISITA.includes(d.tipo) ? d.tipo : "visita",
      fecha: fechaCol(desde), hasta: fechaCol(hasta), nota: txt(d.nota, 200) || null, estado: "esperado", creada_por: "casa",
      valido_desde: new Date(desde).toISOString(), valido_hasta: new Date(hasta).toISOString(),
    };
    for (let i = 0; i < 4; i++) {
      const { data, error } = await db.from("conjuntos_visitas").insert({ ...fila, pase_codigo: codigoPase() }).select("*").single();
      if (!error) return data;
      if (!String(error.message).includes("duplicate")) falla(error.message);
    }
    return falla("No se pudo generar el código, intenta de nuevo");
  }],

  // Consulta liviana para el pitido (cada pocos segundos).
  casa_estado: [CA, async (_d, s) => {
    const por = await q<D[]>(db.from("conjuntos_visitas").select("id,nombre,tipo,documento,placa,nota,creado_at")
      .eq("casa_id", s.casa_id).eq("estado", "por_autorizar").order("creado_at"));
    const { count: paquetes } = await db.from("conjuntos_paquetes").select("id", { count: "exact", head: true }).eq("casa_id", s.casa_id).is("entregado_at", null);
    const ult = await q<D[]>(db.from("conjuntos_comunicados").select("id,creado_at").eq("conjunto_id", s.conjunto_id).order("creado_at", { ascending: false }).limit(1));
    return { por_autorizar: por, paquetes: paquetes || 0, ultimo_comunicado: ult[0]?.creado_at || null };
  }],

  // =================================================================== portería (guardia)
  gu_panel: [GU, async (_d, s) => {
    const h = hoy();
    const activos = await todos((a, b) => db.from("conjuntos_visitas").select("*").eq("conjunto_id", s.conjunto_id)
      .in("estado", ["por_autorizar", "esperado", "adentro"]).lte("fecha", h).order("fecha").range(a, b), 3000);
    const visibles = activos.filter((v) => v.estado !== "esperado" || (v.hasta || v.fecha) >= h);
    const recientes = await q<D[]>(db.from("conjuntos_visitas").select("*").eq("conjunto_id", s.conjunto_id)
      .in("estado", ["salio", "rechazado"]).gte("creado_at", sumarDias(h, -1) + "T00:00:00-05:00").order("creado_at", { ascending: false }).limit(80));
    const paquetes = await q<D[]>(db.from("conjuntos_paquetes").select("*").eq("conjunto_id", s.conjunto_id).is("entregado_at", null).order("recibido_at", { ascending: false }).limit(500));
    const casas = await todos((a, b) => db.from("conjuntos_casas").select("id,codigo,propietario,telefono").eq("conjunto_id", s.conjunto_id).eq("activa", true).order("codigo").range(a, b));
    return { hoy: h, visitas: visibles, recientes, paquetes, casas };
  }],

  gu_ingreso: [GU, async (d, s) => {
    const v = await uno("conjuntos_visitas", d.id, s);
    if (v.estado !== "esperado") falla("Esta visita no está autorizada para entrar");
    if (v.valido_desde && Date.now() < Date.parse(v.valido_desde)) falla("Su pase todavía no es válido");
    if (v.valido_hasta && Date.now() > Date.parse(v.valido_hasta)) falla("El plazo de su pase venció");
    await q(db.from("conjuntos_visitas").update({ estado: "adentro", ingreso_at: new Date().toISOString(), entradas: Number(v.entradas || 0) + 1 }).eq("id", v.id));
    return true;
  }],

  gu_salida: [GU, async (d, s) => {
    const v = await uno("conjuntos_visitas", d.id, s);
    if (v.estado !== "adentro") falla("Esta visita no está adentro");
    // Visitas frecuentes y pases con plazo vigente quedan otra vez esperados (pueden volver a entrar).
    const sigue = v.valido_hasta ? Date.parse(v.valido_hasta) > Date.now() : (v.hasta && v.hasta > hoy());
    await q(db.from("conjuntos_visitas").update({ estado: sigue ? "esperado" : "salio", salida_at: new Date().toISOString() }).eq("id", v.id));
    return true;
  }],

  gu_pase_ver: [GU, async (d, s) => await revisarPase(d.codigo, s)],

  // Vuelve a validar en el servidor (no confía en lo que mostró la pantalla) y aplica entrada o salida.
  gu_pase_usar: [GU, async (d, s) => {
    const r = await revisarPase(d.codigo, s);
    if (!r.ok) falla(r.motivo);
    if (d.accion !== r.accion) falla("El estado del pase cambió. Escanéalo de nuevo.");
    const ahora = new Date().toISOString(), x = r.datos as D;
    if (r.clase === "residente") {
      await q(db.from("conjuntos_residentes").update({ adentro: r.accion === "entrada", mov_at: ahora }).eq("id", x.id));
    } else if (r.accion === "entrada") {
      const hecho = await q<D[]>(db.from("conjuntos_visitas").update({ estado: "adentro", ingreso_at: ahora, entradas: Number(x.entradas || 0) + 1 })
        .eq("id", x.id).eq("estado", "esperado").select("id"));
      if (!hecho.length) falla("Este pase ya se registró. Escanéalo de nuevo.");
    } else {
      const sigue = x.hasta && Date.parse(x.hasta) > Date.now();
      await q(db.from("conjuntos_visitas").update({ estado: sigue ? "esperado" : "salio", salida_at: ahora }).eq("id", x.id).eq("estado", "adentro"));
    }
    return { clase: r.clase, accion: r.accion, nombre: x.nombre };
  }],

  gu_anunciar: [GU, async (d, s) => {
    const casa = await uno("conjuntos_casas", d.casa_id, s, "id");
    const tipo = TIPOS_VISITA.includes(d.tipo) ? d.tipo : "visita";
    const v = await q<D>(db.from("conjuntos_visitas").insert({
      conjunto_id: s.conjunto_id, casa_id: casa.id, nombre: txt(d.nombre, 100) || falla("Escribe el nombre de quien llegó"),
      documento: txt(d.documento, 20) || null, placa: txt(d.placa, 10).toUpperCase() || null, tipo, fecha: hoy(),
      nota: txt(d.nota, 200) || null, estado: "por_autorizar", creada_por: "guardia",
    }).select("*").single());
    return v;
  }],

  gu_anuncio_cancelar: [GU, async (d, s) => {
    const v = await uno("conjuntos_visitas", d.id, s);
    if (v.estado !== "por_autorizar") falla("Ya fue respondida");
    await q(db.from("conjuntos_visitas").update({ estado: "cancelado" }).eq("id", v.id));
    return true;
  }],

  gu_paquete: [GU, async (d, s) => {
    const casa = await uno("conjuntos_casas", d.casa_id, s, "id");
    await q(db.from("conjuntos_paquetes").insert({
      conjunto_id: s.conjunto_id, casa_id: casa.id,
      descripcion: txt(d.descripcion, 160) || falla("Describe el paquete"), empresa: txt(d.empresa, 60) || null,
    }));
    return true;
  }],

  gu_paquete_entregar: [GU, async (d, s) => {
    const p = await uno("conjuntos_paquetes", d.id, s, "id,entregado_at");
    if (p.entregado_at) falla("Ya fue entregado");
    await q(db.from("conjuntos_paquetes").update({ entregado_at: new Date().toISOString(), entregado_a: txt(d.entregado_a, 80) || null }).eq("id", p.id));
    return true;
  }],
};

function json(cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), { headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const d: D = await req.json().catch(() => ({}));
    const op = OPS[String(d.op || "")];
    if (!op) falla("Operación desconocida");
    const s = op![0] ? await sesion(d.token, op![0]) : (null as unknown as S);
    return json({ ok: true, data: await op![1](d, s) });
  } catch (e) {
    if (!(e instanceof Falla)) console.error(e);
    return json({ ok: false, error: e instanceof Falla ? e.message : "Error interno del servidor" });
  }
});
