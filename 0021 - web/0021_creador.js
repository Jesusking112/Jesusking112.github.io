/* 0021 · Panel del proveedor: crea negocios, renueva, suspende y restablece claves. */
(function () {
  "use strict";
  const I = window.Inv;
  let negocios = [], filtro = "";

  const motivo = sessionStorage.getItem("inv0021_motivo");
  if (motivo) { I.$("#motivo").innerHTML = '<div class="banner mal">' + I.esc(motivo) + "</div>"; sessionStorage.removeItem("inv0021_motivo"); }

  function vista() {
    const dentro = I.hayToken() && I.rol() === "creador";
    I.$("#v-login").hidden = dentro;
    I.$("#v-panel").hidden = !dentro;
    I.$("#salir").hidden = !dentro;
    if (dentro) cargar();
  }

  I.$("#f-cr").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await I.accion(e.target.querySelector("[type=submit]"), () => I.llamar("cr_login", { clave: new FormData(e.target).get("clave") }));
    if (r) { I.guardarSesion(r); vista(); }
  });
  I.$("#salir").onclick = () => I.salir();

  function estadoDe(n) {
    const hoy = I.hoy();
    if (n.estado !== "activo") return ["Suspendido", "mal", "bloq"];
    if (n.vence && n.vence < hoy) return ["Vencido " + I.fecha(n.vence), "mal", "bloq"];
    if (n.vence && n.vence <= I.sumarDias(hoy, 7)) return ["Vence " + I.fecha(n.vence), "warn", "vence"];
    return [n.vence ? "Hasta " + I.fecha(n.vence) : "Sin vencimiento", "ok", "activo"];
  }

  async function cargar() {
    const r = await I.accion(null, () => I.llamar("cr_negocios"));
    if (!r) return;
    negocios = r;
    const est = negocios.map(estadoDe);
    I.$("#kpis").innerHTML =
      '<div class="kpi info"><span>Negocios</span><b>' + negocios.length + "</b></div>" +
      '<div class="kpi ok"><span>Activos</span><b>' + est.filter((x) => x[2] !== "bloq").length + "</b></div>" +
      '<div class="kpi warn"><span>Vencen en 7 días</span><b>' + est.filter((x) => x[2] === "vence").length + "</b></div>" +
      '<div class="kpi mal"><span>Vencidos o suspendidos</span><b>' + est.filter((x) => x[2] === "bloq").length + "</b></div>";
    pintar();
  }

  function pintar() {
    let lista = I.buscar(negocios, I.$("#buscar").value, (n) => [n.nombre, ...n.usuarios.map((u) => u.usuario)]);
    if (filtro === "activo") lista = lista.filter((n) => estadoDe(n)[2] !== "bloq");
    else if (filtro) lista = lista.filter((n) => estadoDe(n)[2] === filtro);
    I.$("#conteo").textContent = lista.length + " de " + negocios.length;
    I.$("#lista").innerHTML = lista.length ? lista.map((n) => {
      const e = estadoDe(n);
      const admin = n.usuarios.find((u) => u.rol === "admin");
      return '<div class="item" data-id="' + n.id + '"><div class="principal"><b>' + I.esc(n.nombre) + "</b><small>Admin: " + I.esc(admin ? admin.usuario : "—") +
        " · " + n.usuarios.length + " usuario(s) · " + n.remisiones + " remisiones</small></div>" +
        '<span class="chip ' + e[1] + '">' + I.esc(e[0]) + '</span><div class="acc">' +
        '<button class="btn mini ok" data-a="renovar" type="button">Renovar</button>' +
        '<button class="btn mini" data-a="clave" type="button">Clave admin</button>' +
        (n.estado === "activo" ? '<button class="btn mini peligro" data-a="suspender" type="button">Suspender</button>' : '<button class="btn mini ok" data-a="activar" type="button">Activar</button>') +
        '<button class="btn mini ghost" data-a="borrar" type="button">Borrar</button></div></div>';
    }).join("") : '<p class="vacio">No hay negocios con ese filtro</p>';
  }
  I.$("#buscar").addEventListener("input", I.debounce(pintar));
  I.$("#filtro").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filtro = b.dataset.f;
    I.$$("#filtro button").forEach((x) => x.classList.toggle("on", x === b));
    pintar();
  });

  I.$("#f-crear").addEventListener("submit", async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.target));
    const r = await I.accion(e.target.querySelector("[type=submit]"), () => I.llamar("cr_crear", datos), "Negocio creado");
    if (!r) return;
    const texto = "Acceso a tu sistema de inventario y remisiones\nEnlace: " + location.href.replace(/0021_creador\.html.*$/, "0021_inicio.html") +
      "\nUsuario: " + String(datos.usuario).toLowerCase() + "\nClave: " + datos.clave;
    I.modal('<h3>Negocio creado</h3><p class="muted">Comparte estos datos con el administrador:</p><pre class="sub" style="white-space:pre-wrap;margin:0">' + I.esc(texto) +
      '</pre><div class="fila-btns"><button class="btn primario" type="button" data-c>Copiar acceso</button></div>', (m) => { m.querySelector("[data-c]").onclick = () => I.copiar(texto); });
    e.target.reset();
    cargar();
  });

  I.$("#lista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    const n = negocios.find((x) => x.id === id);
    const a = b.dataset.a;
    if (a === "renovar") {
      I.modal('<h3>Renovar ' + I.esc(n.nombre) + '</h3><form class="pila"><div class="campos"><label class="campo"><span>Sumar meses</span><input name="meses" type="number" min="1" max="36" value="1"></label>' +
        '<label class="campo"><span>O fecha exacta</span><input name="vence" type="date"></label></div><label class="check"><input type="checkbox" name="sin"> Sin vencimiento</label>' +
        '<div class="fila-btns"><button class="btn primario" type="submit">Guardar</button></div></form>', (m, cerrar) => {
        m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const d = Object.fromEntries(new FormData(ev.target));
          const ok = await I.accion(ev.target.querySelector("[type=submit]"), () => d.sin ? I.llamar("cr_sin_vencimiento", { id }) : I.llamar("cr_renovar", { id, meses: d.meses, vence: d.vence }), "Guardado");
          if (ok !== undefined) { cerrar(); cargar(); }
        };
      });
    } else if (a === "clave") {
      I.modal('<h3>Nueva clave del administrador</h3><form class="pila"><label class="campo"><span>Clave nueva</span><input name="clave" minlength="4" required></label><div class="fila-btns"><button class="btn primario" type="submit">Cambiar</button></div></form>', (m, cerrar) => {
        m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const ok = await I.accion(ev.target.querySelector("[type=submit]"), () => I.llamar("cr_clave_admin", { id, clave: new FormData(ev.target).get("clave") }), "Clave cambiada");
          if (ok) cerrar();
        };
      });
    } else if (a === "suspender" || a === "activar") {
      if (a === "suspender" && !(await I.confirmar("Nadie de " + n.nombre + " podrá entrar hasta que lo actives.", "Suspender", true))) return;
      await I.accion(b, () => I.llamar("cr_estado", { id, estado: a === "suspender" ? "suspendido" : "activo" }), "Listo");
      cargar();
    } else if (a === "borrar") {
      I.modal('<h3>Borrar ' + I.esc(n.nombre) + '</h3><p class="muted">Se borran para siempre productos, clientes y remisiones. Escribe BORRAR para confirmar.</p><form class="pila"><input name="confirmar" required><div class="fila-btns"><button class="btn peligro" type="submit">Borrar todo</button></div></form>', (m, cerrar) => {
        m.querySelector("form").onsubmit = async (ev) => {
          ev.preventDefault();
          const ok = await I.accion(ev.target.querySelector("[type=submit]"), () => I.llamar("cr_borrar", { id, confirmar: new FormData(ev.target).get("confirmar") }), "Negocio borrado");
          if (ok) { cerrar(); cargar(); }
        };
      });
    }
  });

  vista();
})();
