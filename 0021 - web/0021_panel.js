/* =============================================================================
   0021 · Panel principal (administrador y vendedor)
   Secciones: Vender · Remisiones · Inventario · Clientes · Códigos · Reportes · Ajustes
   ============================================================================= */
(function () {
  "use strict";
  const I = window.Inv, R = window.Remision;
  const $ = I.$, $$ = I.$$, e = I.esc;
  if (!I.exigir(["admin", "vendedor"])) return;

  const ADMIN = I.rol() === "admin";
  let neg = {}, productos = [], clientes = [], pendientes = [], vendido30 = {};
  let tabActual = "vender";

  // ============================================================== utilidades locales
  const porId = (id) => productos.find((p) => p.id === id);
  const uni = (u) => I.UNIDADES[u] || u;
  const pu = (p) => I.precioPor(p);
  const precioTxt = (v) => { v = Number(v) || 0; return v && Math.abs(v) < 1 ? "$" + v.toLocaleString("es-MX", { maximumFractionDigits: 4 }) : I.dinero(v); };
  const cantPrecio = (i) => I.convertir(i.cantidad, i.unidad, i.precio_unidad || i.unidad);
  const valorStock = (p) => I.convertir(Math.max(0, p.stock), p.unidad, pu(p)) * Number(p.precio);
  const activos = () => productos.filter((p) => p.activo);
  function tabla(cab, filas, der) {
    der = der || [];
    return '<div class="tabla-wrap"><table><thead><tr>' + cab.map((c, i) => "<th" + (der.includes(i) ? ' style="text-align:right"' : "") + ">" + e(c) + "</th>").join("") +
      "</tr></thead><tbody>" + (filas.length ? filas.map((f) => "<tr>" + f.map((c, i) => "<td" + (der.includes(i) ? ' style="text-align:right"' : "") + ">" + c + "</td>").join("") + "</tr>").join("")
      : '<tr><td colspan="' + cab.length + '" class="vacio">Sin datos</td></tr>') + "</tbody></table></div>";
  }
  function stockHtml(p) {
    const cls = p.stock <= 0 ? "stock-cero" : p.stock <= p.minimo ? "stock-bajo" : "";
    return '<span class="' + cls + '">' + I.cifra(p.stock) + " " + uni(p.unidad) + "</span>";
  }
  function llenarMetodos() {
    $("#v-form [name=metodo]").innerHTML = I.opcionesMetodo("transferencia");
    $("#r-metodo").innerHTML = '<option value="">Cualquiera</option>' + I.opcionesMetodo();
  }

  // ============================================================== carga
  async function cargarNegocio() {
    const r = await I.llamar("yo");
    neg = r.negocio;
    $("#neg-nombre").textContent = neg.nombre;
    $("#yo-nombre").textContent = r.nombre + " · " + (ADMIN ? "Administrador" : "Vendedor");
    document.title = neg.nombre + " · Inventario y Remisiones";
    const lt = $("#logo-top");
    if (neg.logo) { lt.classList.add("img"); lt.innerHTML = '<img src="' + e(neg.logo) + '" alt="">'; }
    else { lt.classList.remove("img"); lt.textContent = neg.nombre.slice(0, 2).toUpperCase(); }
    $("#v-etq-doc").textContent = neg.etiqueta_doc || "RFC / NIT";
    pintarVence();
  }
  function pintarVence() {
    const chip = $("#vence-chip"), banda = $("#vence-banda");
    if (!neg.vence) { chip.hidden = true; banda.hidden = true; return; }
    const GRACIA = 5;
    const dias = Math.round((new Date(String(neg.vence).slice(0, 10) + "T00:00:00") - new Date(I.hoy() + "T00:00:00")) / 864e5);
    let corto, titulo, cls;
    if (dias > 7) { corto = dias + " días de servicio"; cls = "info"; }
    else if (dias > 1) { corto = "Quedan " + dias + " días"; titulo = "Tu servicio vence en " + dias + " días"; cls = "warn"; }
    else if (dias === 1) { corto = "Vence mañana"; titulo = "Tu servicio vence mañana"; cls = "warn"; }
    else if (dias === 0) { corto = "Vence hoy"; titulo = "Tu servicio vence hoy"; cls = "mal"; }
    else { const r = Math.max(0, GRACIA + dias); corto = "Vencido"; titulo = "Tu servicio venció · " + r + (r === 1 ? " día" : " días") + " antes del bloqueo"; cls = "mal"; }
    chip.className = "chip " + cls + " vence-chip";
    chip.textContent = corto;
    chip.title = "Servicio activo hasta el " + I.fecha(neg.vence);
    chip.hidden = false;
    const clave = "inv0021_vence_visto_" + neg.vence;
    banda.hidden = !titulo || sessionStorage.getItem(clave) === "1";
    if (!banda.hidden) {
      banda.className = "vence-banda " + cls;
      $("#vence-titulo").textContent = titulo;
      $("#vence-texto").textContent = "Fecha de corte: " + I.fecha(neg.vence) + ". Renueva con tu proveedor para no perder el acceso.";
      $("#vence-cerrar").onclick = () => { sessionStorage.setItem(clave, "1"); banda.hidden = true; };
    }
  }
  async function cargarProductos() {
    productos = await I.llamar("productos", { incluir_inactivos: ADMIN });
    const bajos = activos().filter((p) => p.stock <= p.minimo).length;
    const b = $("#badge-stock"); b.hidden = !bajos; b.textContent = bajos;
  }
  async function cargarClientes() { clientes = await I.llamar("clientes"); }
  async function cargarPendientes() {
    pendientes = await I.llamar("pendientes");
    const b = $("#badge-pend"); b.hidden = !pendientes.length; b.textContent = pendientes.length;
  }
  async function cargarVendido30() {
    const rems = await I.llamar("remisiones", { desde: I.sumarDias(I.hoy(), -30), hasta: I.hoy() });
    vendido30 = {};
    rems.filter((r) => r.estado !== "anulada").forEach((r) => r.items.forEach((it) => { if (it.producto_id) vendido30[it.producto_id] = (vendido30[it.producto_id] || 0) + Number(it.cantidad_stock ?? it.cantidad); }));
  }

  const K_CARRITO = "inv0021_carrito", K_FORM = "inv0021_borrador", K_EDIT = "inv0021_editando";
  const leerLS = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || sessionStorage.getItem(k) || "null") ?? def; } catch (_e) { return def; } };
  let carrito = leerLS(K_CARRITO, []);
  let editando = leerLS(K_EDIT, null);
  let resultados = [], sel = 0;

  function guardarCarrito() { localStorage.setItem(K_CARRITO, JSON.stringify(carrito)); }
  function guardarForm() {
    const f = $("#v-form"); if (!f) return;
    localStorage.setItem(K_FORM, JSON.stringify(Object.fromEntries(new FormData(f))));
  }
  function restaurarForm() {
    const datos = leerLS(K_FORM, null); if (!datos) return;
    const f = $("#v-form");
    Object.entries(datos).forEach(([k, v]) => { if (f.elements[k] && f.elements[k].type !== "file") f.elements[k].value = v; });
    $("#v-estado").dispatchEvent(new Event("change"));
  }
  function pintarEdicion() {
    const b = $("#v-editando");
    $("#v-estado-c").hidden = !!editando;
    if (editando) { $("#v-abono-c").hidden = true; $("#v-metodo-c").hidden = true; $("#v-ref-c").hidden = true; }
    $("#v-guardar").textContent = editando ? "Guardar cambios de la Nº " + editando.numero : "Guardar remisión";
    $("#v-limpiar").textContent = editando ? "Cancelar edición" : "Vaciar";
    b.hidden = !editando;
    if (editando) b.innerHTML = "<b>Editando la remisión Nº " + editando.numero + "</b><span>" + e(editando.cliente) +
      (editando.pagado > 0 ? " · ya abonó " + I.dinero(editando.pagado) + " (se conserva)" : " · sin abonos") +
      "</span><small>Agrega, quita o corrige renglones. El número no cambia y el stock se ajusta solo.</small>";
  }
  async function editarRemision(rem) {
    if (carrito.length && !(editando && editando.id === rem.id) &&
      !(await I.confirmar("Tienes una venta sin guardar en la caja. Se reemplaza por la remisión Nº " + rem.numero + ".", "Reemplazar", true))) return;
    const previo = {};
    const items = (rem.items || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    carrito = items.map((it) => {
      const p = it.producto_id && porId(it.producto_id);
      if (it.producto_id) previo[it.producto_id] = (previo[it.producto_id] || 0) + Number(it.cantidad_stock ?? it.cantidad);
      return {
        k: crypto.randomUUID(), producto_id: it.producto_id || "", nombre: p ? I.nombreProd(p) : it.nombre,
        unidad: it.unidad, precio_unidad: it.precio_unidad || (p ? pu(p) : it.unidad), cantidad: Number(it.cantidad),
        precio: Number(it.precio), precio_lista: Number(it.precio_lista ?? it.precio), corto: p ? p.codigo_corto : "",
      };
    });
    editando = { id: rem.id, numero: rem.numero, cliente: rem.cliente_nombre, pagado: Number(rem.pagado || 0), previo };
    localStorage.setItem(K_EDIT, JSON.stringify(editando));
    const f = $("#v-form"); f.reset();
    const cli = clientes.find((c) => c.id === rem.cliente_id) || {};
    f.elements.cliente_nombre.value = rem.cliente_nombre || "";
    f.elements.direccion.value = rem.direccion || cli.direccion || "";
    f.elements.ciudad.value = rem.ciudad || cli.ciudad || "";
    f.elements.documento.value = rem.documento || cli.documento || "";
    f.elements.telefono.value = cli.telefono || "";
    f.elements.fecha.value = rem.fecha || I.hoy();
    f.elements.notas.value = rem.notas || "";
    guardarCarrito(); guardarForm(); pintarCarrito(); pintarEdicion();
    const tab = $('[data-tab="vender"]'); if (tab) tab.click();
    I.aviso("Remisión Nº " + rem.numero + " lista para editar", "info");
  }
  function importe(it) { return I.importeItem(it); }
  function totalCarrito() { return carrito.reduce((s, it) => s + importe(it), 0); }

  function candidatos(t) {
    t = t.trim();
    if (!t) return [];
    const lista = activos();
    if (t === "*") return lista.slice(0, 60);
    const exactos = lista.filter((p) => p.codigo_barras === t || p.codigo_corto === t);
    const otros = I.buscar(lista, t, (p) => [p.nombre, p.presentacion, p.categoria, p.codigo_corto, p.codigo_barras, p.descripcion]).filter((p) => !exactos.includes(p));
    return exactos.concat(otros).slice(0, 40);
  }
  function pintarResultados() {
    $("#v-resultados").innerHTML = resultados.map((p, i) =>
      '<button type="button" class="resultado' + (i === sel ? " on" : "") + '" data-i="' + i + '"><span class="cc">' + e(p.codigo_corto) + "</span><span><b>" + e(I.nombreProd(p)) +
      "</b><small>" + e(p.categoria || "Sin categoría") + " · Stock " + I.cifra(p.stock) + " " + uni(p.unidad) + '</small></span><span class="pr">' + precioTxt(p.precio) +
      "<small>por " + uni(pu(p)) + "</small></span></button>").join("") +
      ($("#v-buscar").value.trim() && !resultados.length ? '<p class="vacio">No hay productos con eso. ' + (ADMIN ? "Créalo en Inventario o usa “+ Renglón libre”." : "Usa “+ Renglón libre”.") + "</p>" : "");
    const on = $("#v-resultados .on"); if (on) on.scrollIntoView({ block: "nearest" });
  }
  function agregar(p, porCodigo) {
    const ya = carrito.find((it) => it.producto_id === p.id);
    if (ya) ya.cantidad = Math.round((Number(ya.cantidad) + 1) * 1000) / 1000;
    else carrito.push({ k: crypto.randomUUID(), producto_id: p.id, nombre: I.nombreProd(p), unidad: pu(p), precio_unidad: pu(p), cantidad: 1, precio: Number(p.precio), precio_lista: Number(p.precio), corto: p.codigo_corto });
    I.pitido();
    guardarCarrito(); pintarCarrito();
    const fila = $('#v-renglones tr[data-k="' + (ya ? ya.k : carrito[carrito.length - 1].k) + '"]');
    if (fila) { fila.style.background = "rgba(56,189,248,.12)"; setTimeout(() => { fila.style.background = ""; }, 700); }
    $("#v-buscar").value = ""; resultados = []; pintarResultados();
    if (!porCodigo && fila) { const c = fila.querySelector("[data-c=cantidad]"); c.focus(); c.select(); }
    else $("#v-buscar").focus();
  }
  function porCodigo(codigo) {
    const c = String(codigo).trim();
    return activos().find((p) => p.codigo_barras === c || p.codigo_corto === c);
  }
  function pintarCarrito() {
    $("#v-vacio").hidden = !!carrito.length;
    $("#v-renglones").innerHTML = carrito.map((it) => {
      const p = it.producto_id ? porId(it.producto_id) : null;
      const cambiado = it.producto_id && Number(it.precio) !== Number(it.precio_lista);
      const desc = it.producto_id
        ? '<span class="desc-n">' + e(it.nombre) + "</span><small>Cód. " + e(it.corto || "") + (p ? " · quedan " + I.cifra(p.stock) + " " + uni(p.unidad) : "") + (cambiado ? " · lista " + precioTxt(it.precio_lista) : "") +
          '<span class="eq">' + equivalencia(it) + "</span></small>"
        : '<input data-c="nombre" value="' + e(it.nombre) + '" placeholder="Descripción" aria-label="Descripción"><small><select data-c="unidad" aria-label="Unidad">' +
          Object.keys(I.UNIDADES).map((u) => '<option value="' + u + '"' + (u === it.unidad ? " selected" : "") + ">" + uni(u) + "</option>").join("") + "</select></small>";
      return '<tr data-k="' + it.k + '"><td class="cant"><div class="cant-box"><div class="paso"><button type="button" data-paso="-1" aria-label="Quitar uno">&minus;</button><input data-c="cantidad" type="number" step="any" min="0" inputmode="decimal" value="' + e(it.cantidad) + '" aria-label="Cantidad"><button type="button" data-paso="1" aria-label="Sumar uno">+</button></div>' + (p ? '<select data-c="unidad" class="uni-sel" aria-label="Unidad de venta">' + I.opcionesUnidadCorta(it.unidad, I.compatibles(p.unidad)) + "</select>" : '<span class="uni">' + uni(it.unidad) + "</span>") +
        '</div></td><td class="desc">' + desc + '</td><td class="prec' + (cambiado ? " cambiado" : "") + '"><input data-c="precio" type="number" step="any" min="0" inputmode="decimal" value="' + e(it.precio) +
        '" aria-label="Precio unitario">' + (it.precio_unidad ? '<small class="por">por ' + uni(it.precio_unidad) + "</small>" : "") + '</td><td class="imp"' + (verImporte() ? "" : " hidden") + ' style="text-align:right;font-weight:700">' + I.dinero(importe(it)) + '</td><td><button type="button" class="quitar" aria-label="Quitar renglón">&times;</button></td></tr>';
    }).join("");
    pintarTotal();
  }
  function pasoDe(u) { return u === "g" || u === "ml" || u === "mg" ? 10 : 1; }
  function equivalencia(it) {
    if (!it.precio_unidad || it.unidad === it.precio_unidad || !(Number(it.cantidad) > 0)) return "";
    return " · = " + I.cifra(I.convertir(it.cantidad, it.unidad, it.precio_unidad), 4) + " " + uni(it.precio_unidad);
  }
  function pintarTotal() {
    $("#v-total").textContent = I.dinero(totalCarrito());
    const n = carrito.length;
    $("#v-resumen").textContent = n + (n === 1 ? " renglón" : " renglones") + (n ? " · " + I.cantidadConLetra(totalCarrito(), (neg.moneda || "pesos").toLowerCase()).toLowerCase() : "");
  }

  function verImporte() { return localStorage.getItem("inv0021_ver_importe") !== "0"; }

  function iniciarVender() {
    $("#v-fecha").value = I.hoy();
    const verImp = $("#v-ver-importe"), K_VER = "inv0021_ver_importe";
    verImp.checked = verImporte();
    const aplicarVer = () => {
      localStorage.setItem(K_VER, verImp.checked ? "1" : "0");
      $("#v-tabla").classList.toggle("sin-importe", !verImp.checked);
      document.querySelectorAll("#v-tabla .imp").forEach((c) => { c.hidden = !verImp.checked; });
    };
    verImp.addEventListener("change", aplicarVer);
    aplicarVer();
    const busc = $("#v-buscar");
    busc.addEventListener("input", () => { resultados = candidatos(busc.value); sel = 0; pintarResultados(); });
    busc.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") { ev.preventDefault(); sel = Math.min(resultados.length - 1, sel + 1); pintarResultados(); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); sel = Math.max(0, sel - 1); pintarResultados(); }
      else if (ev.key === "Enter") {
        if (ev.isComposing || ev.keyCode === 229) return;
        ev.preventDefault();
        const exacto = porCodigo(busc.value);
        if (exacto) agregar(exacto, true);
        else if (resultados[sel]) agregar(resultados[sel], false);
        else if (busc.value.trim()) { I.pitido(true); I.aviso("No existe un producto con “" + busc.value.trim() + "”", "error"); busc.select(); }
      } else if (ev.key === "Escape") { busc.value = ""; resultados = []; pintarResultados(); }
    });
    $("#v-resultados").addEventListener("click", (ev) => { const b = ev.target.closest("[data-i]"); if (b) agregar(resultados[Number(b.dataset.i)], false); });

    document.addEventListener("keydown", (ev) => {
      if (tabActual !== "vender" || ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector(".modal-fondo")) return;
      const a = document.activeElement;
      if (a && a.matches("input, textarea, select")) return;
      if (/^[0-9A-Za-z]$/.test(ev.key)) busc.focus();
    });

    const tb = $("#v-renglones");
    tb.addEventListener("input", (ev) => {
      const tr = ev.target.closest("tr[data-k]"); if (!tr) return;
      const it = carrito.find((x) => x.k === tr.dataset.k); if (!it) return;
      const campo = ev.target.dataset.c;
      if (campo === "cantidad" || campo === "precio") it[campo] = ev.target.value === "" ? "" : Number(ev.target.value);
      else if (campo) it[campo] = ev.target.value;
      if (campo === "unidad") { const u = tr.querySelector(".uni"); if (u) u.textContent = uni(it.unidad); }
      const eq = tr.querySelector(".eq"); if (eq) eq.textContent = equivalencia(it);
      if (campo === "precio" && it.producto_id) tr.querySelector(".prec").classList.toggle("cambiado", Number(it.precio) !== Number(it.precio_lista));
      tr.querySelector(".imp").textContent = I.dinero(importe(it));
      guardarCarrito(); pintarTotal();
    });
    tb.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || ev.isComposing || ev.keyCode === 229) return;
      ev.preventDefault();
      if (ev.target.dataset.c === "cantidad") { const p = ev.target.closest("tr").querySelector("[data-c=precio]"); p.focus(); p.select(); }
      else busc.focus();
    });
    tb.addEventListener("click", (ev) => {
      const bp = ev.target.closest("[data-paso]");
      if (bp) {
        const tr = bp.closest("tr[data-k]");
        const it = carrito.find((x) => x.k === tr.dataset.k); if (!it) return;
        const salto = pasoDe(it.unidad);
        const nuevo = Math.max(0, Math.round(((Number(it.cantidad) || 0) + salto * Number(bp.dataset.paso)) * 10000) / 10000);
        const inp = tr.querySelector("[data-c=cantidad]");
        inp.value = nuevo;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      if (!ev.target.closest(".quitar")) return;
      const k = ev.target.closest("tr").dataset.k;
      carrito = carrito.filter((x) => x.k !== k);
      guardarCarrito(); pintarCarrito();
    });
    $("#v-libre").onclick = () => {
      carrito.push({ k: crypto.randomUUID(), producto_id: "", nombre: "", unidad: "kg", cantidad: 1, precio: 0 });
      guardarCarrito(); pintarCarrito();
      $("#v-renglones tr:last-child [data-c=nombre]").focus();
    };
    $("#v-limpiar").onclick = async () => {
      const msg = editando ? "Se descartan los cambios. La remisión Nº " + editando.numero + " queda como estaba." : "Se quitan todos los renglones y el cliente.";
      if (carrito.length && !(await I.confirmar(msg, editando ? "Cancelar edición" : "Vaciar", true))) return;
      limpiarVenta();
    };

    const cli = $("#v-cliente"), sug = $("#v-sug");
    let sugs = [], sSel = 0;
    const pintarSug = () => {
      sug.hidden = !sugs.length;
      sug.innerHTML = sugs.map((c, i) => '<button type="button" data-i="' + i + '" class="' + (i === sSel ? "on" : "") + '">' + e(c.nombre) + "<small>" +
        e([c.ciudad, c.telefono, c.pendiente ? "Debe " + I.dinero(c.pendiente) : ""].filter(Boolean).join(" · ") || "Sin datos extra") + "</small></button>").join("");
    };
    const elegir = (c) => {
      cli.value = c.nombre; sugs = []; pintarSug();
      const f = $("#v-form");
      ["direccion", "ciudad", "documento", "telefono"].forEach((k) => { f.elements[k].value = c[k] || ""; });
      if (c.pendiente) I.aviso(c.nombre + " tiene " + I.dinero(c.pendiente) + " pendiente de pago", "info");
    };
    cli.addEventListener("input", () => { sugs = cli.value.trim() ? I.buscar(clientes, cli.value, (c) => [c.nombre, c.telefono, c.ciudad, c.documento]).slice(0, 8) : []; sSel = 0; pintarSug(); });
    cli.addEventListener("keydown", (ev) => {
      if (sug.hidden) return;
      if (ev.key === "ArrowDown") { ev.preventDefault(); sSel = Math.min(sugs.length - 1, sSel + 1); pintarSug(); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); sSel = Math.max(0, sSel - 1); pintarSug(); }
      else if (ev.key === "Enter" && !ev.isComposing && ev.keyCode !== 229 && sugs[sSel]) { ev.preventDefault(); elegir(sugs[sSel]); }
      else if (ev.key === "Escape") { sugs = []; pintarSug(); }
    });
    cli.addEventListener("blur", () => setTimeout(() => { sugs = []; pintarSug(); }, 150));
    sug.addEventListener("mousedown", (ev) => { const b = ev.target.closest("[data-i]"); if (b) { ev.preventDefault(); elegir(sugs[Number(b.dataset.i)]); } });

    $("#v-estado").addEventListener("change", (ev) => {
      const v = ev.target.value, cobra = v !== "pendiente";
      $("#v-metodo-c").hidden = !cobra; $("#v-ref-c").hidden = !cobra;
      $("#v-abono-c").hidden = v !== "parcial";
      if (v === "parcial") $("#v-abono").focus();
    });

    $("#v-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!carrito.length) { I.aviso("Agrega al menos un producto", "error"); busc.focus(); return; }
      const malo = carrito.findIndex((it) => !(Number(it.cantidad) > 0) || it.precio === "" || Number(it.precio) < 0 || (!it.producto_id && !String(it.nombre).trim()));
      if (malo >= 0) { I.aviso("Revisa el renglón " + (malo + 1) + ": cantidad, precio o descripción", "error"); return; }
      const disponible = (id) => Number(porId(id).stock) + (editando && editando.previo ? Number(editando.previo[id] || 0) : 0);
      const sinStock = carrito.filter((it) => it.producto_id && porId(it.producto_id) && I.convertir(it.cantidad, it.unidad, porId(it.producto_id).unidad) > disponible(it.producto_id));
      if (sinStock.length && !(await I.confirmar("No alcanza el stock de: " + sinStock.map((x) => x.nombre).join(", ") + ". El inventario quedará en negativo. ¿Guardar igual?", "Guardar igual"))) return;
      const datos = Object.fromEntries(new FormData(ev.target));
      if (editando) {
        if (totalCarrito() + 0.005 < editando.pagado) { I.aviso("El nuevo total queda menor a lo que ya abonó (" + I.dinero(editando.pagado) + "). Borra un abono primero.", "error"); return; }
        datos.id = editando.id;
        datos.items = carrito.map((it) => ({ producto_id: it.producto_id, nombre: it.nombre, unidad: it.unidad, cantidad: it.cantidad, precio: it.precio }));
        const re = await I.accion($("#v-guardar"), () => I.llamar("rem_editar", datos), "Remisión Nº " + editando.numero + " actualizada");
        if (!re) return;
        limpiarVenta();
        Promise.all([cargarProductos(), cargarClientes(), cargarPendientes()]).catch(() => {});
        const remE = await I.llamar("remision_numero", { numero: re.numero }).catch(() => null);
        if (remE) verRemision(remE, true);
        return;
      }
      if (datos.estado === "parcial") {
        const tot = totalCarrito(), ab = Number(datos.abono);
        if (!(ab > 0)) { I.aviso("Escribe cuánto abonó", "error"); $("#v-abono").focus(); return; }
        if (ab >= tot) datos.estado = "pagado";
      }
      datos.items = carrito.map((it) => ({ producto_id: it.producto_id, nombre: it.nombre, unidad: it.unidad, cantidad: it.cantidad, precio: it.precio }));
      const r = await I.accion($("#v-guardar"), () => I.llamar("vender", datos));
      if (!r) return;
      limpiarVenta();
      Promise.all([cargarProductos(), cargarClientes(), cargarPendientes()]).catch(() => {});
      const rem = await I.llamar("remision_numero", { numero: r.numero }).catch(() => null);
      if (rem) verRemision(rem, true);
    });
    const fv = $("#v-form");
    fv.addEventListener("input", guardarForm);
    fv.addEventListener("change", guardarForm);
    restaurarForm();
    pintarCarrito();
    pintarEdicion();
    if (carrito.length && !editando) I.aviso("Recuperé la venta que tenías sin guardar (" + carrito.length + " renglones)", "info");
  }
  function limpiarVenta() {
    carrito = []; guardarCarrito(); pintarCarrito();
    editando = null; localStorage.removeItem(K_EDIT); localStorage.removeItem(K_FORM);
    const f = $("#v-form"); f.reset(); $("#v-fecha").value = I.hoy();
    $("#v-metodo-c").hidden = true; $("#v-ref-c").hidden = true; $("#v-abono-c").hidden = true;
    llenarMetodos();
    pintarEdicion();
    $("#v-buscar").focus();
  }

  let camaraOn = false, ultimoCodigo = "", ultimoTiempo = 0;
  let modoCam = "", flujo = null, bucle = 0;
  function leido(c) {
    if (!c) return;
    const ahora = Date.now();
    if (c === ultimoCodigo && ahora - ultimoTiempo < 1800) return;
    ultimoCodigo = c; ultimoTiempo = ahora;
    const p = porCodigo(c);
    if (p) agregar(p, true);
    else { I.pitido(true); I.aviso("Código " + c + " no está en el inventario", "error"); }
  }
  function detenerCamara() {
    camaraOn = false;
    cancelAnimationFrame(bucle);
    if (modoCam === "quagga") { try { window.Quagga.offDetected(); window.Quagga.stop(); } catch (_e) { /* */ } }
    if (flujo) { flujo.getTracks().forEach((t) => t.stop()); flujo = null; }
    modoCam = "";
    $("#v-cam-box").hidden = true; $("#v-camara").textContent = "Cámara";
    $$("#v-cam video, #v-cam canvas").forEach((x) => x.remove());
  }
  async function camaraNativa() {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices) return false;
    const soportados = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
    const formatos = ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "code_39"].filter((f) => soportados.includes(f));
    if (!formatos.length) return false;
    const detector = new window.BarcodeDetector({ formats: formatos });
    flujo = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.setAttribute("playsinline", ""); video.srcObject = flujo;
    $("#v-cam").prepend(video);
    await video.play();
    modoCam = "nativo"; camaraOn = true;
    let trabajando = false, ultimo = 0;
    const ciclo = async (t) => {
      if (!camaraOn) return;
      bucle = requestAnimationFrame(ciclo);
      if (trabajando || t - ultimo < 200 || video.readyState < 2) return;
      ultimo = t; trabajando = true;
      try { const r = await detector.detect(video); if (r.length) leido(r[0].rawValue); } catch (_e) { /* cuadro perdido */ }
      trabajando = false;
    };
    bucle = requestAnimationFrame(ciclo);
    return true;
  }
  function camaraQuagga() {
    if (!window.Quagga) { $("#v-cam-box").hidden = true; I.aviso("El lector de cámara no cargó. Revisa tu internet.", "error"); return; }
    window.Quagga.init({
      inputStream: { type: "LiveStream", target: $("#v-cam"), constraints: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } } },
      locator: { patchSize: "medium", halfSample: true },
      numOfWorkers: Math.min(2, navigator.hardwareConcurrency || 1),
      frequency: 6,
      decoder: { readers: ["ean_reader", "ean_8_reader", "code_128_reader", "upc_reader"] },
      locate: true,
    }, (err) => {
      if (err) { $("#v-cam-box").hidden = true; I.aviso("No se pudo abrir la cámara: " + (err.message || err), "error"); return; }
      modoCam = "quagga";
      if ($("#v-cam-box").hidden) { detenerCamara(); return; }
      window.Quagga.start();
      camaraOn = true;
    });
    window.Quagga.onDetected((res) => leido(res && res.codeResult && res.codeResult.code));
  }
  async function iniciarCamara() {
    $("#v-cam-box").hidden = false; $("#v-camara").textContent = "Cerrar cámara";
    try { if (await camaraNativa()) return; }
    catch (err) {
      detenerCamara();
      if (err && err.name === "NotAllowedError") return I.aviso("Da permiso de cámara al navegador para escanear", "error");
      $("#v-cam-box").hidden = false; $("#v-camara").textContent = "Cerrar cámara";
    }
    camaraQuagga();
  }
  $("#v-camara").onclick = () => (camaraOn || flujo || !$("#v-cam-box").hidden ? detenerCamara() : iniciarCamara());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") detenerCamara(); });

  // ============================================================== VER REMISIÓN (compartido)
  function cajaPagos(rem) {
    if (rem.estado === "anulada") return "";
    const tot = Number(rem.total), pag = Number(rem.pagado || 0), sal = Math.max(0, tot - pag);
    const pct = tot > 0 ? Math.min(100, Math.round((pag / tot) * 100)) : 100;
    const abonos = (rem.abonos || []).slice().sort((a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado));
    return '<div class="pagos-caja"><div class="pagos-cifras">' +
      '<div><span>Total</span><b>' + I.dinero(tot) + '</b></div><div class="ok"><span>Pagado</span><b>' + I.dinero(pag) + '</b></div>' +
      '<div class="' + (sal > 0 ? "warn" : "ok") + '"><span>Falta</span><b>' + I.dinero(sal) + "</b></div></div>" +
      '<div class="barra-pago" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Porcentaje pagado"><i style="width:' + pct + '%"></i></div>' +
      (abonos.length ? '<ul class="abonos">' + abonos.map((a) => '<li data-ab="' + a.id + '"><span>' + I.fecha(a.fecha) + " · " + e(I.METODOS[a.metodo] || a.metodo || "—") +
        (a.referencia ? " · Ref. " + e(a.referencia) : "") + (a.usuario_nombre ? " · " + e(a.usuario_nombre) : "") + "</span><b>" + I.dinero(a.monto) + "</b>" +
        (ADMIN ? '<button class="btn mini peligro" data-a="borrar-abono" type="button" aria-label="Borrar este abono">Borrar</button>' : "") + "</li>").join("") + "</ul>"
        : '<p class="muted" style="margin:6px 0 0">Aún no hay pagos registrados.</p>') + "</div>";
  }
  function verRemision(rem, recienCreada) {
    const cli = clientes.find((c) => c.id === rem.cliente_id);
    const tel = cli && cli.telefono;
    const debe = rem.estado === "pendiente" || rem.estado === "parcial";
    I.modal('<h3>' + (recienCreada ? "Remisión guardada · " : "") + "Nº " + rem.numero + " " + I.chipEstado(rem.estado) + "</h3>" +
      '<p class="muted" style="margin-top:0">' + e(rem.cliente_nombre) + " · " + I.fecha(rem.fecha) + " · " + I.dinero(rem.total) + (rem.vendedor_nombre ? " · vendió " + e(rem.vendedor_nombre) : "") +
      (rem.estado === "anulada" ? "<br>Anulada: " + e(rem.anulada_motivo || "") : "") + "</p>" + cajaPagos(rem) +
      '<div class="fila-btns" style="justify-content:flex-start;margin:0 0 12px">' +
        '<button class="btn primario" data-a="pdf" type="button">Imprimir / PDF</button>' +
        (window.Ticket ? '<button class="btn" data-a="ticket" type="button">Ticket</button>' : "") +
        '<a class="btn wa" data-a="wa" target="_blank" rel="noopener" href="' + I.whatsapp(tel || "", R.textoWhatsApp(neg, rem)) + '">WhatsApp' + (tel ? "" : " (elige contacto)") + "</a>" +
        (debe ? '<button class="btn ok" data-a="pagar" type="button">Registrar pago / abono</button>' : "") +
        (debe ? '<button class="btn" data-a="editar" type="button">Editar / agregar productos</button>' : "") +
        (ADMIN && (rem.estado === "pagado" || rem.estado === "parcial") ? '<button class="btn ghost" data-a="pend" type="button">Quitar todos los pagos</button>' : "") +
        '<button class="btn ghost" data-a="nota" type="button">Nota</button>' +
        (ADMIN && rem.estado !== "anulada" ? '<button class="btn peligro" data-a="anular" type="button">Anular</button>' : "") +
        (ADMIN && debe ? '<button class="btn peligro" data-a="eliminar" type="button">Eliminar</button>' : "") +
        (recienCreada ? '<button class="btn" data-a="otra" type="button">Nueva venta</button>' : "") +
      '</div><div id="m-vista"></div>', (m, cerrar) => {
      R.vistaPrevia($("#m-vista", m), neg, rem);
      if (recienCreada && window.Ticket && window.Ticket.autoAlVender()) window.Ticket.imprimir(neg, rem);
      m.addEventListener("click", async (ev) => {
        const b = ev.target.closest("[data-a]"); if (!b) return;
        const a = b.dataset.a;
        if (a === "pdf") R.imprimir(neg, rem);
        else if (a === "ticket") window.Ticket.abrir(neg, rem);
        else if (a === "otra") cerrar();
        else if (a === "pagar") { cerrar(); pagar(rem); }
        else if (a === "editar") { cerrar(); editarRemision(rem); }
        else if (a === "pend") {
          if (!(await I.confirmar("Se borran TODOS los pagos de la remisión Nº " + rem.numero + " (" + I.dinero(rem.pagado) + ") y vuelve a quedar debiendo " + I.dinero(rem.total) + ".", "Quitar pagos", true))) return;
          if (await I.accion(b, () => I.llamar("rem_pendiente", { id: rem.id }), "Regresó a pendiente")) { cerrar(); trasCambio(); }
        } else if (a === "borrar-abono") {
          const li = b.closest("[data-ab]"), ab = (rem.abonos || []).find((x) => x.id === li.dataset.ab);
          if (!ab || !(await I.confirmar("¿Borrar el abono de " + I.dinero(ab.monto) + " del " + I.fecha(ab.fecha) + "? El saldo se recalcula solo.", "Borrar abono", true))) return;
          if (await I.accion(b, () => I.llamar("abono_borrar", { id: ab.id }), "Abono borrado")) { cerrar(); trasCambio(); }
        }
        else if (a === "nota") {
          const nota = prompt("Nota de la remisión (sale impresa):", rem.notas || "");
          if (nota !== null && (await I.accion(b, () => I.llamar("rem_nota", { id: rem.id, notas: nota }), "Nota guardada"))) { cerrar(); trasCambio(); }
        } else if (a === "eliminar") {
          cerrar();
          eliminarRemision(rem);
        } else if (a === "anular") {
          cerrar();
          I.modal('<h3>Anular remisión Nº ' + rem.numero + '</h3><p class="muted">El número queda guardado como ANULADA y el stock de los productos regresa al inventario.</p><form class="pila"><label class="campo"><span>Motivo</span><input name="motivo" required maxlength="200"></label><div class="fila-btns"><button class="btn peligro" type="submit">Anular</button></div></form>', (m2, c2) => {
            m2.querySelector("form").onsubmit = async (ev2) => {
              ev2.preventDefault();
              if (await I.accion(ev2.target.querySelector("[type=submit]"), () => I.llamar("rem_anular", { id: rem.id, motivo: new FormData(ev2.target).get("motivo") }), "Remisión anulada")) { c2(); cargarProductos(); trasCambio(); }
            };
          });
        }
      });
    }, true);
  }
  async function eliminarRemision(rem) {
    const paso1 = await I.confirmar("Vas a ELIMINAR la remisión Nº " + rem.numero + " de " + rem.cliente_nombre + " por " + I.dinero(rem.total) +
      ". Desaparece por completo y el stock regresa al inventario. Si solo quieres dejar constancia, usa Anular.", "Sí, quiero eliminarla", true);
    if (!paso1) return;
    I.modal('<h3>Última confirmación</h3><p class="muted">Esto no se puede deshacer. Escribe el número <b>' + rem.numero + '</b> para eliminar la remisión.</p>' +
      '<form class="pila"><label class="campo"><span>Número de la remisión</span><input name="numero" inputmode="numeric" autocomplete="off" required></label>' +
      '<div class="fila-btns"><button class="btn ghost" data-no type="button">Cancelar</button><button class="btn peligro" type="submit" disabled>Eliminar definitivamente</button></div></form>', (m, cerrar) => {
      const f = m.querySelector("form"), inp = f.elements.numero, boton = f.querySelector("[type=submit]");
      inp.focus();
      inp.oninput = () => { boton.disabled = inp.value.trim() !== String(rem.numero); };
      m.querySelector("[data-no]").onclick = cerrar;
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        if (inp.value.trim() !== String(rem.numero)) return;
        if (await I.accion(boton, () => I.llamar("rem_eliminar", { id: rem.id }), "Remisión eliminada")) { cerrar(); cargarProductos(); trasCambio(); }
      };
    });
  }
  function pagar(rem) {
    const saldo = Math.round((Number(rem.total) - Number(rem.pagado || 0)) * 100) / 100;
    I.modal('<h3>Registrar pago · Nº ' + rem.numero + '</h3><p class="muted" style="margin-top:0">' + e(rem.cliente_nombre) + " · Total " + I.dinero(rem.total) +
      (Number(rem.pagado) > 0 ? " · ya pagó " + I.dinero(rem.pagado) : "") + "<br>Falta por pagar: <b>" + I.dinero(saldo) + '</b></p><form class="pila">' +
      '<label class="campo"><span>¿Cuánto paga ahora?</span><input type="number" name="monto" min="0.01" max="' + saldo + '" step="0.01" value="' + saldo + '" required inputmode="decimal"></label>' +
      '<div class="fila-btns" style="justify-content:flex-start;margin:0"><button class="btn mini" data-m="1" type="button">Todo</button><button class="btn mini" data-m=".5" type="button">La mitad</button><button class="btn mini" data-m=".25" type="button">Una cuarta parte</button></div>' +
      '<p class="muted" data-queda style="margin:0"></p><div class="campos">' +
      '<label class="campo"><span>Método</span><select name="metodo">' + I.opcionesMetodo("deposito") + '</select></label>' +
      '<label class="campo"><span>Fecha del pago</span><input type="date" name="fecha_pago" value="' + I.hoy() + '"></label></div>' +
      '<label class="campo"><span>Referencia / Nº de depósito (opcional)</span><input name="referencia" maxlength="80"></label>' +
      '<div class="fila-btns"><button class="btn ok" type="submit">Registrar pago</button></div></form>', (m, cerrar) => {
      const f = m.querySelector("form"), inp = f.elements.monto, queda = m.querySelector("[data-queda]"), boton = f.querySelector("[type=submit]");
      const pintar = () => {
        const v = Number(inp.value) || 0, r = Math.round((saldo - v) * 100) / 100;
        queda.textContent = v > saldo ? "No puede pagar más de lo que debe (" + I.dinero(saldo) + ")" : r <= 0 ? "Con esto queda PAGADA por completo." : "Después de este abono seguirá debiendo " + I.dinero(r) + ".";
        boton.textContent = v >= saldo ? "Registrar pago completo" : "Registrar abono";
      };
      inp.oninput = pintar; pintar(); inp.select();
      m.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { inp.value = Math.round(saldo * Number(b.dataset.m) * 100) / 100; pintar(); }));
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(f));
        if (!(Number(d.monto) > 0) || Number(d.monto) > saldo) { I.aviso("Revisa el monto", "error"); return; }
        if (Number(d.monto) >= saldo) delete d.monto;
        if (await I.accion(boton, () => I.llamar("rem_pagar", Object.assign({ id: rem.id }, d)), "Pago registrado")) { cerrar(); trasCambio(); }
      };
    });
  }
  function trasCambio() {
    cargarPendientes().then(() => { if (tabActual === "remisiones") cargarRemisiones(); }).catch(() => {});
    cargarClientes().catch(() => {});
  }

  // ============================================================== REMISIONES
  let rems = [], rModo = "mes";
  function rangoRapido(r) {
    const h = I.hoy();
    return {
      hoy: [h, h], ayer: [I.sumarDias(h, -1), I.sumarDias(h, -1)], semana: [I.inicioSemana(h), h], mes: [I.inicioMes(h), h],
      "30": [I.sumarDias(h, -29), h], "90": [I.sumarDias(h, -89), h], "año": [h.slice(0, 4) + "-01-01", h],
    }[r];
  }
  async function cargarRemisiones() {
    if (rModo === "pend") { rems = pendientes; pintarRemisiones(); return; }
    const r = await I.accion(null, () => I.llamar("remisiones", { desde: $("#r-desde").value, hasta: $("#r-hasta").value }));
    if (r) { rems = r; pintarRemisiones(); }
  }
  function filtrarRemisiones() {
    let l = I.buscar(rems, $("#r-buscar").value, (r) => [r.numero, r.cliente_nombre, r.referencia, r.notas, r.vendedor_nombre, r.ciudad, ...r.items.map((i) => i.nombre)]);
    const est = $("#r-estado").value, met = $("#r-metodo").value, mn = I.numero($("#r-min").value), mx = I.numero($("#r-max").value);
    if (est === "") l = l.filter((r) => r.estado !== "anulada");
    else if (est === "debe") l = l.filter((r) => r.estado === "pendiente" || r.estado === "parcial");
    else if (est !== "*") l = l.filter((r) => r.estado === est);
    if (met) l = l.filter((r) => r.metodo === met);
    if (mn !== null) l = l.filter((r) => Number(r.total) >= mn);
    if (mx !== null) l = l.filter((r) => Number(r.total) <= mx);
    const o = $("#r-orden").value;
    l = l.slice().sort(o === "fecha" ? (a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero : o === "mayor" ? (a, b) => b.total - a.total : o === "cliente" ? (a, b) => a.cliente_nombre.localeCompare(b.cliente_nombre) : (a, b) => b.numero - a.numero);
    return l;
  }
  function saldoDe(r) {
    return r.estado === "pendiente" || r.estado === "parcial" ? Math.max(0, Number(r.total) - Number(r.pagado || 0)) : 0;
  }
  function pintarRemisiones() {
    const l = filtrarRemisiones();
    const vivas = l.filter((r) => r.estado !== "anulada");
    const suma = (arr) => arr.reduce((s, r) => s + Number(r.total), 0);
    const cobrado = (arr) => arr.reduce((s, r) => s + Number(r.pagado || 0), 0);
    const falta = (arr) => arr.reduce((s, r) => s + saldoDe(r), 0);
    const deben = vivas.filter((r) => saldoDe(r) > 0), parciales = vivas.filter((r) => r.estado === "parcial");
    $("#r-kpis").innerHTML =
      '<div class="kpi info"><span>Vendido</span><b>' + I.dinero(suma(vivas)) + "</b><small>" + vivas.length + " remisiones</small></div>" +
      '<div class="kpi ok"><span>Cobrado</span><b>' + I.dinero(cobrado(vivas)) + "</b><small>incluye abonos</small></div>" +
      '<div class="kpi warn"><span>Falta por cobrar</span><b>' + I.dinero(falta(vivas)) + "</b><small>" + deben.length + " deben · " + parciales.length + " con abono</small></div>" +
      '<div class="kpi"><span>Falta total (todas las fechas)</span><b>' + I.dinero(falta(pendientes)) + "</b><small>" + pendientes.length + " remisiones deben</small></div>";
    $("#r-conteo").textContent = l.length + " de " + rems.length + " remisiones" + (rModo === "pend" ? " (todas las pendientes)" : " del " + I.fecha($("#r-desde").value) + " al " + I.fecha($("#r-hasta").value));
    const vista = l.slice(0, 400);
    $("#r-lista").innerHTML = vista.length ? vista.map((r) =>
      '<div class="item" data-id="' + r.id + '"><div class="principal"><b>Nº ' + r.numero + " · " + e(r.cliente_nombre) + "</b><small>" + I.fecha(r.fecha) + " · " + r.items.length + " renglón(es)" +
      (r.referencia ? " · Ref. " + e(r.referencia) : "") + (r.metodo && r.estado === "pagado" ? " · " + e(I.METODOS[r.metodo] || r.metodo) : "") +
      (r.estado === "parcial" ? ' · <span class="debe">abonó ' + I.dinero(r.pagado) + " · falta " + I.dinero(saldoDe(r)) + "</span>" : "") + "</small></div>" + I.chipEstado(r.estado) +
      '<span class="monto">' + I.dinero(r.total) + '</span><div class="acc"><button class="btn mini" data-a="ver" type="button">Ver</button><button class="btn mini" data-a="pdf" type="button">PDF</button>' +
      (saldoDe(r) > 0 ? '<button class="btn mini ok" data-a="pagar" type="button">Cobrar</button>' : "") + "</div></div>").join("") +
      (l.length > vista.length ? '<p class="vacio">Mostrando 400 de ' + l.length + ". Afina la búsqueda.</p>" : "")
      : '<p class="vacio">No hay remisiones con estos filtros</p>';
  }
  function iniciarRemisiones() {
    const [d, h] = rangoRapido("mes");
    $("#r-desde").value = d; $("#r-hasta").value = h;
    $("#r-rapido").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-r]"); if (!b) return;
      $$("#r-rapido button").forEach((x) => x.classList.toggle("on", x === b));
      rModo = b.dataset.r;
      if (rModo === "pend") $("#r-estado").value = "debe";
      else { const [a, z] = rangoRapido(rModo); $("#r-desde").value = a; $("#r-hasta").value = z; }
      cargarRemisiones();
    });
    ["#r-desde", "#r-hasta"].forEach((s) => $(s).addEventListener("change", () => { rModo = "rango"; $$("#r-rapido button").forEach((x) => x.classList.remove("on")); cargarRemisiones(); }));
    $("#r-buscar").addEventListener("input", I.debounce(pintarRemisiones));
    ["#r-estado", "#r-metodo", "#r-orden"].forEach((s) => $(s).addEventListener("change", pintarRemisiones));
    ["#r-min", "#r-max"].forEach((s) => $(s).addEventListener("input", I.debounce(pintarRemisiones, 300)));
    $("#r-lista").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-a]"); if (!b) return;
      const r = rems.find((x) => x.id === b.closest("[data-id]").dataset.id); if (!r) return;
      if (b.dataset.a === "ver") verRemision(r);
      else if (b.dataset.a === "pdf") R.imprimir(neg, r);
      else pagar(r);
    });
    $("#r-numero").onclick = () => I.modal('<h3>Buscar remisión por número</h3><form class="pila"><label class="campo"><span>Nº de remisión</span><input name="n" type="number" min="1" required inputmode="numeric"></label><div class="fila-btns"><button class="btn primario" type="submit">Buscar</button></div></form>', (m, cerrar) => {
      m.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        const r = await I.accion(ev.target.querySelector("[type=submit]"), () => I.llamar("remision_numero", { numero: new FormData(ev.target).get("n") }));
        if (r) { cerrar(); verRemision(r); }
      };
    });
    $("#r-csv").onclick = () => {
      const l = filtrarRemisiones();
      I.csv("remisiones_" + I.hoy(), [["Nº", "Fecha", "Cliente", "Estado", "Total", "Pagado", "Falta", "Método", "Referencia", "Fecha último pago", "Vendedor", "Productos"]]
        .concat(l.map((r) => [r.numero, r.fecha, r.cliente_nombre, r.estado, r.total, Number(r.pagado || 0), saldoDe(r), I.METODOS[r.metodo] || "", r.referencia || "", r.fecha_pago || "", r.vendedor_nombre || "", r.items.map((i) => I.cifra(i.cantidad) + " " + uni(i.unidad) + " " + i.nombre).join(" | ")])));
    };
    $("#r-pdf-todas").onclick = async () => {
      const l = filtrarRemisiones();
      if (!l.length) return I.aviso("No hay remisiones en la lista", "error");
      if (l.length > 150) return I.aviso("Son " + l.length + ". Filtra a 150 o menos para imprimir.", "error");
      if (await I.confirmar("Se imprimirán " + l.length + " remisiones, una por hoja.", "Imprimir")) R.imprimir(neg, l.slice().sort((a, b) => a.numero - b.numero));
    };
  }

  // ============================================================== INVENTARIO
  let iVista = "simple", iFiltro = "";
  function filtrarProductos() {
    let l = I.buscar(productos, $("#i-buscar").value, (p) => [p.nombre, p.presentacion, p.categoria, p.codigo_corto, p.codigo_barras, p.descripcion]);
    l = iFiltro === "inactivo" ? l.filter((p) => !p.activo) : l.filter((p) => p.activo);
    if (iFiltro === "bajo") l = l.filter((p) => p.stock <= p.minimo && p.stock > 0);
    if (iFiltro === "cero") l = l.filter((p) => p.stock <= 0);
    const cat = $("#i-cat").value, un = $("#i-uni").value, pmin = I.numero($("#i-pmin").value), pmax = I.numero($("#i-pmax").value);
    if (cat) l = l.filter((p) => (p.categoria || "") === cat);
    if (un) l = l.filter((p) => p.unidad === un);
    if (pmin !== null) l = l.filter((p) => Number(p.precio) >= pmin);
    if (pmax !== null) l = l.filter((p) => Number(p.precio) <= pmax);
    const o = $("#i-orden").value;
    const f = {
      nombre: (a, b) => I.nombreProd(a).localeCompare(I.nombreProd(b)), valor: (a, b) => b.stock * b.precio - a.stock * a.precio,
      stock: (a, b) => a.stock - b.stock, precio: (a, b) => b.precio - a.precio, vendido: (a, b) => (vendido30[b.id] || 0) - (vendido30[a.id] || 0),
      corto: (a, b) => Number(a.codigo_corto) - Number(b.codigo_corto),
    }[o];
    return l.slice().sort(f);
  }
  function pintarInventario() {
    const act = activos();
    const valor = act.reduce((s, p) => s + Math.max(0, p.stock) * p.precio, 0);
    const conCosto = act.filter((p) => p.costo !== null && p.costo !== undefined);
    const valorCosto = conCosto.reduce((s, p) => s + Math.max(0, p.stock) * p.costo, 0);
    $("#i-kpis").innerHTML =
      '<div class="kpi info"><span>Productos activos</span><b>' + act.length + "</b></div>" +
      '<div class="kpi ok"><span>Valor del inventario (precio)</span><b>' + I.dinero(valor) + "</b>" + (conCosto.length ? "<small>A costo: " + I.dinero(valorCosto) + "</small>" : "") + "</div>" +
      '<div class="kpi warn"><span>Stock bajo</span><b>' + act.filter((p) => p.stock <= p.minimo && p.stock > 0).length + "</b></div>" +
      '<div class="kpi mal"><span>Agotados</span><b>' + act.filter((p) => p.stock <= 0).length + "</b></div>";
    const cats = [...new Set(productos.map((p) => p.categoria).filter(Boolean))].sort();
    const cs = $("#i-cat"), cv = cs.value;
    cs.innerHTML = '<option value="">Todas las categorías</option>' + cats.map((c) => '<option' + (c === cv ? " selected" : "") + ">" + e(c) + "</option>").join("");
    const us = $("#i-uni"), uv = us.value;
    us.innerHTML = '<option value="">Todas las unidades</option>' + Object.keys(I.UNIDADES).map((u) => '<option value="' + u + '"' + (u === uv ? " selected" : "") + ">" + e(I.NOMBRE_UNIDAD[u]) + "</option>").join("");

    const l = filtrarProductos();
    $("#i-conteo").textContent = l.length + " producto(s) · valor de la lista " + I.dinero(l.reduce((s, p) => s + valorStock(p), 0));
    if (iVista === "simple") {
      $("#i-lista").innerHTML = '<div class="lista">' + (l.length ? l.map((p) =>
        '<div class="item' + (p.stock <= p.minimo ? " alerta" : "") + '" data-id="' + p.id + '"><span class="cc-chip">' + e(p.codigo_corto) + '</span><div class="principal"><b>' + e(I.nombreProd(p)) + "</b><small>" +
        e(p.categoria || "Sin categoría") + " · " + precioTxt(p.precio) + " / " + uni(pu(p)) + (p.descripcion ? " · " + e(p.descripcion) : "") + "</small></div>" +
        '<span class="monto">' + stockHtml(p) + "</span>" +
        (ADMIN ? '<div class="acc"><div class="paso rapido" role="group" aria-label="Ajuste rápido de stock"><button type="button" data-a="menos" aria-label="Restar ' + pasoDe(p.unidad) + " " + uni(p.unidad) + '">&minus;' + pasoDe(p.unidad) + '</button><button type="button" data-a="mas" aria-label="Sumar ' + pasoDe(p.unidad) + " " + uni(p.unidad) + '">+' + pasoDe(p.unidad) + '</button></div><button class="btn mini ok" data-a="entrada" type="button">Entrada</button><button class="btn mini" data-a="precio" type="button">Precio</button><button class="btn mini ghost" data-a="editar" type="button">Editar</button></div>' : "") +
        "</div>").join("") : '<p class="vacio">No hay productos con estos filtros' + (ADMIN && !productos.length ? ". Crea el primero con “+ Producto”." : "") + "</p>") + "</div>";
    } else {
      $("#i-lista").innerHTML = tabla(["Cód.", "Producto", "Categoría", "Precio", "Costo", "Stock", "Mínimo", "Valor", "Vendido 30 d", "Código de barras", ""],
        l.map((p) => ['<span class="cc-chip">' + e(p.codigo_corto) + "</span>", "<b>" + e(I.nombreProd(p)) + "</b>" + (p.activo ? "" : ' <span class="chip">Oculto</span>'), e(p.categoria || "—"),
          precioTxt(p.precio) + " / " + uni(pu(p)), p.costo != null ? precioTxt(p.costo) : "—", stockHtml(p), I.cifra(p.minimo), I.dinero(valorStock(p)),
          I.cifra(vendido30[p.id] || 0) + " " + uni(p.unidad), '<span class="codigo">' + e(p.codigo_barras) + "</span>",
          ADMIN ? '<span data-id="' + p.id + '" class="fila" style="gap:6px;flex-wrap:nowrap"><button class="btn mini ok" data-a="entrada" type="button">+</button><button class="btn mini" data-a="editar" type="button">Editar</button></span>' : ""]), [3, 4, 5, 6, 7, 8]);
    }
  }
  function formProducto(p) {
    p = p || {};
    const cats = [...new Set(productos.map((x) => x.categoria).filter(Boolean))].sort();
    const uniP = p.unidad || "kg", puP = p.id ? pu(p) : uniP;
    I.modal('<h3>' + (p.id ? "Editar producto" : "Nuevo producto") + '</h3><form class="pila"><div class="campos">' +
      '<label class="campo"><span>Nombre</span><input name="nombre" required maxlength="120" value="' + e(p.nombre || "") + '" placeholder="Arroz"></label>' +
      '<label class="campo"><span>Presentación (opcional)</span><input name="presentacion" maxlength="40" value="' + e(p.presentacion || "") + '" placeholder="500 g, 1 kg, 600 ml"></label>' +
      '<label class="campo"><span>Cuentas el stock en</span><select name="unidad">' + I.opcionesUnidad(uniP) + "</select></label>" +
      '<label class="campo"><span>El precio es por</span><select name="precio_unidad">' + I.opcionesUnidad(puP, I.compatibles(uniP)) + "</select></label>" +
      '<label class="campo"><span id="fp-e-precio">¿Cuánto vale cada ' + uni(puP) + '?</span><input name="precio" type="number" step="any" min="0" required value="' + e(p.precio ?? "") + '"></label>' +
      '<label class="campo"><span id="fp-e-costo">Costo por ' + uni(puP) + ' (opcional)</span><input name="costo" type="number" step="any" min="0" value="' + e(p.costo ?? "") + '"></label>' +
      (p.id ? "" : '<label class="campo"><span id="fp-e-stock">Stock inicial (en ' + uni(uniP) + ')</span><input name="stock" type="number" step="any" value="0"></label>') +
      '<label class="campo"><span id="fp-e-min">Avisar si baja de (' + uni(uniP) + ')</span><input name="minimo" type="number" step="any" min="0" value="' + e(p.minimo ?? 0) + '"></label>' +
      '<label class="campo"><span>Categoría</span><input name="categoria" list="cats0021" maxlength="60" value="' + e(p.categoria || "") + '"><datalist id="cats0021">' + cats.map((c) => '<option value="' + e(c) + '">').join("") + "</datalist></label>" +
      "</div>" +
      '<p class="equiv" id="fp-equiv" aria-live="polite"></p>' +
      '<label class="campo"><span>Descripción</span><input name="descripcion" maxlength="400" value="' + e(p.descripcion || "") + '"></label>' +
      '<details' + (p.id ? "" : "") + '><summary class="muted" style="cursor:pointer">Códigos (vacío = se generan solos)</summary><div class="campos" style="margin-top:10px">' +
      '<label class="campo"><span>Código de barras (si el producto ya trae uno, escanéalo aquí)</span><input name="codigo_barras" maxlength="40" value="' + e(p.codigo_barras || "") + '"></label>' +
      '<label class="campo"><span>Código corto (3 a 6 dígitos)</span><input name="codigo_corto" inputmode="numeric" maxlength="6" value="' + e(p.codigo_corto || "") + '"></label></div></details>' +
      '<div class="fila-btns">' + (p.id ? (p.activo ? '<button class="btn ghost" type="button" data-a="ocultar">Ocultar</button>' : '<button class="btn ghost" type="button" data-a="mostrar">Volver a mostrar</button>') +
        '<button class="btn ghost" type="button" data-a="movs">Movimientos</button><button class="btn" type="button" data-a="stock">Mover stock</button>' : "") +
      '<button class="btn primario" type="submit">Guardar</button></div></form>', (m, cerrar) => {
      const f = m.querySelector("form");
      f.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.name === "codigo_barras") ev.preventDefault(); });
      const su = f.elements.unidad, sp = f.elements.precio_unidad, ip = f.elements.precio;
      const refrescar = (cambioStock) => {
        const u = su.value;
        if (cambioStock) { const v = I.compatibles(u).includes(sp.value) ? sp.value : u; sp.innerHTML = I.opcionesUnidad(v, I.compatibles(u)); }
        const q = sp.value, pr = Number(ip.value) || 0;
        $("#fp-e-precio", m).textContent = "¿Cuánto vale cada " + uni(q) + "?";
        $("#fp-e-costo", m).textContent = "Costo por " + uni(q) + " (opcional)";
        $("#fp-e-min", m).textContent = "Avisar si baja de (" + uni(u) + ")";
        const es = $("#fp-e-stock", m); if (es) es.textContent = "Stock inicial (en " + uni(u) + ")";
        const otras = I.compatibles(u).filter((x) => x !== q && x !== "mg");
        let t = pr > 0 ? "Equivale a " + otras.map((x) => precioTxt(pr * I.convertir(1, x, q)) + " por " + uni(x)).join(" · ") + "." : "Escribe el precio y aquí verás cuánto vale en las otras unidades.";
        const st = f.elements.stock ? Number(f.elements.stock.value) || 0 : Number(p.stock) || 0;
        if (pr > 0 && st > 0) t += " Tus " + I.cifra(st) + " " + uni(u) + " valen " + I.dinero(I.convertir(st, u, q) * pr) + ".";
        $("#fp-equiv", m).textContent = t;
      };
      su.addEventListener("change", () => refrescar(true));
      f.addEventListener("input", (ev) => { if (ev.target !== su) refrescar(false); });
      refrescar(false);
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(f));
        if (p.id) d.id = p.id;
        const r = await I.accion(f.querySelector("[type=submit]"), () => I.llamar("prod_guardar", d), p.id ? "Producto guardado" : "Producto creado");
        if (r) { cerrar(); await cargarProductos(); pintarInventario(); if (!p.id) I.aviso("Código corto " + r.codigo_corto + " · barras " + r.codigo_barras, "info"); }
      };
      m.addEventListener("click", async (ev) => {
        const b = ev.target.closest("[data-a]"); if (!b) return;
        if (b.dataset.a === "ocultar" || b.dataset.a === "mostrar") {
          if (await I.accion(b, () => I.llamar("prod_activo", { id: p.id, activo: b.dataset.a === "mostrar" }), "Listo")) { cerrar(); await cargarProductos(); pintarInventario(); }
        } else if (b.dataset.a === "movs") { cerrar(); verMovimientos(p.id); }
        else if (b.dataset.a === "stock") { cerrar(); moverStock(p, "entrada"); }
      });
    });
  }
  function moverStock(p, tipo) {
    I.modal('<h3>Stock · ' + e(I.nombreProd(p)) + '</h3><p class="muted" style="margin-top:0">Ahora hay <b>' + I.cifra(p.stock) + " " + uni(p.unidad) + '</b></p><form class="pila">' +
      '<div class="opciones" role="radiogroup">' + [["entrada", "Entrada", "Llegó mercancía"], ["salida", "Salida", "Merma, regalo, uso"], ["ajuste", "Conteo", "Dejar el número exacto"]].map(([v, t, s]) =>
        '<label class="opcion' + (v === tipo ? " on" : "") + '"><input type="radio" name="tipo" value="' + v + '"' + (v === tipo ? " checked" : "") + ' hidden><b>' + t + "</b><small>" + s + "</small></label>").join("") + "</div>" +
      '<div class="campos"><label class="campo"><span id="ms-etq">Cantidad</span><input name="cantidad" type="number" step="any" min="0" required></label>' +
      '<label class="campo"><span>En</span><select name="u">' + I.opcionesUnidad(p.unidad, I.compatibles(p.unidad)) + "</select></label></div>" +
      '<p class="equiv" id="ms-eq" aria-live="polite"></p>' +
      '<label class="campo"><span>Nota (opcional)</span><input name="nota" maxlength="200" placeholder="Proveedor, factura…"></label>' +
      '<div class="fila-btns"><button class="btn primario" type="submit">Guardar</button></div></form>', (m, cerrar) => {
      m.querySelectorAll(".opcion").forEach((o) => o.addEventListener("click", () => {
        m.querySelectorAll(".opcion").forEach((x) => x.classList.toggle("on", x === o));
        $("#ms-etq", m).textContent = o.querySelector("input").value === "ajuste" ? "Cantidad real contada" : "Cantidad";
      }));
      const fm = m.querySelector("form");
      const eqStock = () => {
        const c = Number(fm.elements.cantidad.value) || 0, u = fm.elements.u.value;
        $("#ms-eq", m).textContent = c > 0 && u !== p.unidad ? "= " + I.cifra(I.convertir(c, u, p.unidad), 4) + " " + uni(p.unidad) + " en el inventario" : "";
      };
      fm.addEventListener("input", eqStock); fm.addEventListener("change", eqStock);
      m.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(ev.target));
        d.cantidad = Math.round(I.convertir(d.cantidad, d.u, p.unidad) * 10000) / 10000; delete d.u;
        const r = await I.accion(ev.target.querySelector("[type=submit]"), () => I.llamar("prod_stock", Object.assign({ id: p.id }, d)));
        if (r !== undefined) { I.aviso("Stock ahora: " + I.cifra(r) + " " + uni(p.unidad), "ok"); cerrar(); await cargarProductos(); pintarInventario(); }
      };
    });
  }
  function cambiarPrecio(p) {
    I.modal('<h3>Precio · ' + e(I.nombreProd(p)) + '</h3><form class="pila"><label class="campo"><span>Precio por ' + uni(pu(p)) + '</span><input name="precio" type="number" step="any" min="0" required value="' + e(p.precio) +
      '"></label><div class="fila-btns"><button class="btn primario" type="submit">Guardar</button></div></form>', (m, cerrar) => {
      const inp = m.querySelector("[name=precio]"); inp.select();
      m.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        if (await I.accion(ev.target.querySelector("[type=submit]"), () => I.llamar("prod_precio", { id: p.id, precio: inp.value }), "Precio actualizado")) { cerrar(); await cargarProductos(); pintarInventario(); }
      };
    });
  }
  async function verMovimientos(productoId) {
    const movs = await I.accion(null, () => I.llamar("movimientos", { producto_id: productoId || "", limite: 500 }));
    if (!movs) return;
    const TIP = { entrada: ["Entrada", "ok"], salida: ["Salida", "warn"], ajuste: ["Conteo", "info"], venta: ["Venta", ""], anulacion: ["Anulación", "mal"] };
    I.modal('<h3>Movimientos de stock' + (productoId && porId(productoId) ? " · " + e(I.nombreProd(porId(productoId))) : "") + '</h3><div class="buscador"><label class="lupa"><span class="sr-only">Buscar</span><input id="mv-b" placeholder="Producto, tipo, nota, usuario…"></label></div><div class="lista" id="mv-l"></div>', (m) => {
      const pintar = () => {
        const l = I.buscar(movs, $("#mv-b", m).value, (x) => [x.producto && x.producto.nombre, x.producto && x.producto.presentacion, TIP[x.tipo][0], x.nota, x.usuario_nombre]);
        $("#mv-l", m).innerHTML = l.length ? l.map((x) => '<div class="item"><div class="principal"><b>' + e(x.producto ? (x.producto.nombre + " " + (x.producto.presentacion || "")).trim() : "—") + "</b><small>" + I.fecha(x.creado, true) +
          (x.nota ? " · " + e(x.nota) : "") + (x.usuario_nombre ? " · " + e(x.usuario_nombre) : "") + '</small></div><span class="chip ' + TIP[x.tipo][1] + '">' + TIP[x.tipo][0] + '</span><span class="monto">' +
          (x.cantidad > 0 ? "+" : "") + I.cifra(x.cantidad) + "<small style=\"display:block;font-weight:500\" class=\"muted\">queda " + I.cifra(x.stock_despues) + "</small></span></div>").join("") : '<p class="vacio">Sin movimientos</p>';
      };
      $("#mv-b", m).addEventListener("input", I.debounce(pintar));
      pintar();
    }, true);
  }
  function importar() {
    I.modal('<h3>Importar productos</h3><p class="muted" style="margin-top:0">Un producto por línea, separado por punto y coma:<br><code>nombre; presentación; unidad del stock; precio; stock; categoría; precio por</code><br>Unidades: mg, g, kg, lb, oz, ml, l, gal, und, doc. “Precio por” es opcional (si lo dejas vacío, el precio es por la misma unidad del stock). Ej.: <code>Chía; ; g; 85; 30000; Semillas; kg</code> = tienes 30 000 g y vale $85 el kg. Los códigos se crean solos. Los repetidos se saltan.</p>' +
      '<form class="pila"><textarea name="t" rows="10" placeholder="Ajo molido; ; kg; 49; 200; Especias\nChía; ; g; 85; 30000; Semillas; kg\nArroz; 500 g; und; 18; 40; Granos\nArroz; 1 kg; und; 32; 25; Granos"></textarea><p class="muted" id="imp-prev" style="margin:0"></p>' +
      '<div class="fila-btns"><button class="btn primario" type="submit">Importar</button></div></form>', (m, cerrar) => {
      const ta = m.querySelector("textarea");
      const leer = () => ta.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
        const c = l.split(/[;\t]/).map((x) => x.trim());
        return { nombre: c[0], presentacion: c[1] || "", unidad: (c[2] || "kg").toLowerCase(), precio: (c[3] || "0").replace(/[$\s]/g, ""), stock: c[4] || "0", categoria: c[5] || "", precio_unidad: (c[6] || "").toLowerCase() };
      });
      ta.addEventListener("input", I.debounce(() => { $("#imp-prev", m).textContent = leer().length + " producto(s) listos para importar"; }));
      m.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        const filas = leer();
        if (!filas.length) return I.aviso("Pega al menos una línea", "error");
        const r = await I.accion(ev.target.querySelector("[type=submit]"), () => I.llamar("prod_importar", { filas }));
        if (!r) return;
        cerrar(); await cargarProductos(); pintarInventario();
        I.modal("<h3>Importación terminada</h3><p>Creados: <b>" + r.creados.length + "</b> · Saltados: <b>" + r.omitidos.length + "</b></p>" + (r.omitidos.length ? '<div class="lista corta">' + r.omitidos.map((x) => '<div class="item"><small>' + e(x) + "</small></div>").join("") + "</div>" : ""));
      };
    });
  }
  function iniciarInventario() {
    $("#i-buscar").addEventListener("input", I.debounce(pintarInventario));
    ["#i-cat", "#i-uni", "#i-orden"].forEach((s) => $(s).addEventListener("change", pintarInventario));
    ["#i-pmin", "#i-pmax"].forEach((s) => $(s).addEventListener("input", I.debounce(pintarInventario, 300)));
    $("#i-chips").addEventListener("click", (ev) => { const b = ev.target.closest("[data-f]"); if (!b) return; iFiltro = b.dataset.f; $$("#i-chips button").forEach((x) => x.classList.toggle("on", x === b)); pintarInventario(); });
    $$("[data-vista]").forEach((b) => b.addEventListener("click", () => { iVista = b.dataset.vista; $$("[data-vista]").forEach((x) => x.classList.toggle("on", x === b)); pintarInventario(); }));
    $("#i-nuevo").onclick = () => formProducto();
    $("#i-importar").onclick = importar;
    $("#i-movs").onclick = () => verMovimientos();
    $("#i-lista").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-a]"); if (!b) return;
      const p = porId(b.closest("[data-id]").dataset.id); if (!p) return;
      if (b.dataset.a === "editar") formProducto(p);
      else if (b.dataset.a === "entrada") moverStock(p, "entrada");
      else if (b.dataset.a === "precio") cambiarPrecio(p);
      else if (b.dataset.a === "mas" || b.dataset.a === "menos") ajusteRapido(p, b);
    });
  }
  async function ajusteRapido(p, b) {
    const salto = pasoDe(p.unidad), mas = b.dataset.a === "mas";
    if (!mas && p.stock - salto < 0) { I.aviso("No hay suficiente stock para restar " + salto + " " + uni(p.unidad), "error"); return; }
    b.disabled = true;
    try {
      const r = await I.llamar("prod_stock", { id: p.id, tipo: mas ? "entrada" : "salida", cantidad: salto, nota: "Ajuste rápido" });
      p.stock = Number(r);
      const fila = b.closest(".item");
      if (fila) { fila.querySelector(".monto").innerHTML = stockHtml(p); fila.classList.toggle("alerta", p.stock <= p.minimo); }
      const bajos = activos().filter((x) => x.stock <= x.minimo).length;
      const bd = $("#badge-stock"); bd.hidden = !bajos; bd.textContent = bajos;
    } catch (err) { I.aviso(err.message || "No se pudo ajustar", "error"); }
    finally { b.disabled = false; }
    $("#i-csv").onclick = () => I.csv("inventario_" + I.hoy(), [["Código corto", "Código de barras", "Producto", "Presentación", "Categoría", "Unidad stock", "Precio por", "Precio", "Costo", "Stock", "Mínimo", "Valor", "Descripción"]]
      .concat(filtrarProductos().map((p) => [p.codigo_corto, p.codigo_barras, p.nombre, p.presentacion || "", p.categoria || "", p.unidad, pu(p), p.precio, p.costo ?? "", p.stock, p.minimo, Math.round(valorStock(p) * 100) / 100, p.descripcion || ""])));
  }

  // ============================================================== CLIENTES
  let cFiltro = "";
  function filtrarClientes() {
    let l = I.buscar(clientes, $("#c-buscar").value, (c) => [c.nombre, c.telefono, c.ciudad, c.direccion, c.documento, c.notas]);
    const hace60 = I.sumarDias(I.hoy(), -60);
    if (cFiltro === "debe") l = l.filter((c) => c.pendiente > 0);
    if (cFiltro === "sin") l = l.filter((c) => !c.compras);
    if (cFiltro === "inactivo") l = l.filter((c) => c.ultima && c.ultima < hace60);
    const o = $("#c-orden").value;
    return l.slice().sort(o === "total" ? (a, b) => b.total - a.total : o === "pendiente" ? (a, b) => b.pendiente - a.pendiente : o === "ultima" ? (a, b) => String(b.ultima || "").localeCompare(String(a.ultima || "")) : (a, b) => a.nombre.localeCompare(b.nombre));
  }
  function pintarClientes() {
    const l = filtrarClientes();
    $("#c-conteo").textContent = l.length + " de " + clientes.length + " clientes · pendiente " + I.dinero(l.reduce((s, c) => s + c.pendiente, 0));
    $("#c-lista").innerHTML = l.length ? l.slice(0, 500).map((c) =>
      '<div class="item' + (c.pendiente > 0 ? " alerta" : "") + '" data-id="' + c.id + '"><div class="principal"><b>' + e(c.nombre) + "</b><small>" + e([c.telefono, c.ciudad].filter(Boolean).join(" · ") || "Sin datos") +
      " · " + c.compras + " compra(s)" + (c.ultima ? " · última " + I.fecha(c.ultima) : "") + "</small></div>" +
      (c.pendiente > 0 ? '<span class="chip warn">Debe ' + I.dinero(c.pendiente) + "</span>" : "") + '<span class="monto">' + I.dinero(c.total) + "</span>" +
      '<div class="acc"><button class="btn mini" data-a="hist" type="button">Historial</button><button class="btn mini ghost" data-a="editar" type="button">Editar</button>' +
      (ADMIN && !c.compras ? '<button class="btn mini ghost" data-a="borrar" type="button">Borrar</button>' : "") + "</div></div>").join("")
      : '<p class="vacio">No hay clientes con ese filtro</p>';
  }
  function formCliente(c) {
    c = c || {};
    I.modal('<h3>' + (c.id ? "Editar cliente" : "Nuevo cliente") + '</h3><form class="pila"><label class="campo"><span>Nombre (no se puede repetir)</span><input name="nombre" required maxlength="120" value="' + e(c.nombre || "") + '"></label>' +
      '<details' + (c.id ? " open" : "") + '><summary class="muted" style="cursor:pointer">Más datos (opcional)</summary><div class="campos" style="margin-top:10px">' +
      '<label class="campo"><span>Teléfono / WhatsApp</span><input name="telefono" value="' + e(c.telefono || "") + '"></label><label class="campo"><span>Dirección</span><input name="direccion" value="' + e(c.direccion || "") + '"></label>' +
      '<label class="campo"><span>Ciudad</span><input name="ciudad" value="' + e(c.ciudad || "") + '"></label><label class="campo"><span>' + e(neg.etiqueta_doc || "RFC / NIT") + '</span><input name="documento" value="' + e(c.documento || "") + '"></label>' +
      '</div><label class="campo" style="margin-top:10px"><span>Notas</span><input name="notas" value="' + e(c.notas || "") + '"></label></details>' +
      '<div class="fila-btns"><button class="btn primario" type="submit">Guardar</button></div></form>', (m, cerrar) => {
      m.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(ev.target));
        if (c.id) d.id = c.id;
        if (await I.accion(ev.target.querySelector("[type=submit]"), () => I.llamar(c.id ? "cli_editar" : "cli_crear", d), "Cliente guardado")) { cerrar(); await cargarClientes(); pintarClientes(); }
      };
    });
  }
  async function historialCliente(c) {
    const l = await I.accion(null, () => I.llamar("remisiones", { desde: I.sumarDias(I.hoy(), -730), hasta: I.hoy() }));
    if (!l) return;
    const suyas = l.filter((r) => r.cliente_id === c.id);
    const prods = {};
    suyas.filter((r) => r.estado !== "anulada").forEach((r) => r.items.forEach((it) => {
      const k = it.producto_id || it.nombre;
      const x = prods[k] ??= { nombre: it.nombre, unidad: it.unidad, cant: 0, imp: 0 };
      x.cant += I.convertir(it.cantidad, it.unidad, x.unidad); x.imp += Number(it.importe);
    }));
    const top = Object.values(prods).sort((a, b) => b.imp - a.imp);
    I.modal("<h3>" + e(c.nombre) + '</h3><div class="kpis"><div class="kpi info"><span>Comprado (2 años)</span><b>' + I.dinero(c.total) + '</b></div><div class="kpi warn"><span>Pendiente</span><b>' + I.dinero(c.pendiente) +
      '</b></div><div class="kpi"><span>Remisiones</span><b>' + suyas.length + "</b></div></div>" +
      '<h4 style="margin:6px 0">Lo que más compra</h4>' + I.barrasH(top.slice(0, 8).map((x) => ({ etq: x.nombre, valor: x.imp, texto: I.cifra(x.cant) + " " + uni(x.unidad) + " · " + I.dinero(x.imp) }))) +
      '<h4 style="margin:14px 0 6px">Remisiones</h4><div class="lista corta" id="hc-l">' + (suyas.length ? suyas.map((r) => '<div class="item" data-id="' + r.id + '"><div class="principal"><b>Nº ' + r.numero + "</b><small>" + I.fecha(r.fecha) + "</small></div>" +
        I.chipEstado(r.estado) + '<span class="monto">' + I.dinero(r.total) + '</span><div class="acc"><button class="btn mini" type="button">Ver</button></div></div>').join("") : '<p class="vacio">Sin remisiones</p>') + "</div>", (m, cerrar) => {
      $("#hc-l", m).addEventListener("click", (ev) => { const it = ev.target.closest("[data-id]"); if (!it) return; const r = suyas.find((x) => x.id === it.dataset.id); cerrar(); verRemision(r); });
    }, true);
  }
  function iniciarClientes() {
    $("#c-buscar").addEventListener("input", I.debounce(pintarClientes));
    $("#c-orden").addEventListener("change", pintarClientes);
    $("#c-chips").addEventListener("click", (ev) => { const b = ev.target.closest("[data-f]"); if (!b) return; cFiltro = b.dataset.f; $$("#c-chips button").forEach((x) => x.classList.toggle("on", x === b)); pintarClientes(); });
    $("#c-nuevo").onclick = () => formCliente();
    $("#c-lista").addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-a]"); if (!b) return;
      const c = clientes.find((x) => x.id === b.closest("[data-id]").dataset.id); if (!c) return;
      if (b.dataset.a === "editar") formCliente(c);
      else if (b.dataset.a === "hist") historialCliente(c);
      else if (b.dataset.a === "borrar" && (await I.confirmar("Se borra " + c.nombre + ".", "Borrar", true))) {
        if (await I.accion(b, () => I.llamar("cli_borrar", { id: c.id }), "Cliente borrado")) { await cargarClientes(); pintarClientes(); }
      }
    });
    $("#c-csv").onclick = () => I.csv("clientes_" + I.hoy(), [["Nombre", "Teléfono", "Dirección", "Ciudad", "Documento", "Compras", "Total", "Pendiente", "Última compra"]]
      .concat(filtrarClientes().map((c) => [c.nombre, c.telefono || "", c.direccion || "", c.ciudad || "", c.documento || "", c.compras, c.total, c.pendiente, c.ultima || ""])));
  }

  // ============================================================== CÓDIGOS DE BARRAS
  const marcadas = new Set();
  let eLimite = 60;
  const cacheEtq = new Map();
  async function imagenEtiqueta(p) {
    const conPrecio = $("#e-precio").checked;
    const k = p.id + "|" + p.codigo_barras + "|" + p.codigo_corto + "|" + I.nombreProd(p) + "|" + (conPrecio ? p.precio : "");
    if (!cacheEtq.has(k)) cacheEtq.set(k, (await I.etiquetaCanvas(p, conPrecio)).toDataURL("image/png"));
    return cacheEtq.get(k);
  }
  function filtrarEtiquetas() { return I.buscar(activos(), $("#e-buscar").value, (p) => [p.nombre, p.presentacion, p.categoria, p.codigo_corto, p.codigo_barras]).sort((a, b) => Number(a.codigo_corto) - Number(b.codigo_corto)); }
  async function pintarEtiquetas() {
    if (!window.JsBarcode) { $("#e-lista").innerHTML = '<p class="vacio">Cargando generador de códigos…</p>'; setTimeout(pintarEtiquetas, 800); return; }
    const l = filtrarEtiquetas();
    const vista = l.slice(0, eLimite);
    $("#e-lista").innerHTML = vista.length ? vista.map((p) => '<div class="etiqueta' + (marcadas.has(p.id) ? " on" : "") + '" data-id="' + p.id + '"><img alt="Código de ' + e(I.nombreProd(p)) + '" width="600" height="300"><div class="acc"><label class="btn mini ghost"><input type="checkbox" class="marca-sel"' +
      (marcadas.has(p.id) ? " checked" : "") + "> Marcar</label>" + '<button class="btn mini" data-a="png" type="button">PNG</button><button class="btn mini ghost" data-a="copiar" type="button">' + e(p.codigo_corto) + "</button></div></div>").join("") +
      (l.length > vista.length ? '<button class="btn" id="e-mas" type="button">Mostrar más (' + (l.length - vista.length) + ")</button>" : "")
      : '<p class="vacio">' + (productos.length ? "Nada con esa búsqueda" : "Primero crea productos en Inventario") + "</p>";
    for (const p of vista) {
      const img = $('.etiqueta[data-id="' + p.id + '"] img');
      if (img) img.src = await imagenEtiqueta(p);
    }
  }
  async function descargarEtiqueta(p) { I.descargar(await imagenEtiqueta(p), I.nombreArchivo(I.nombreProd(p)) + "_" + p.codigo_corto + ".png"); }
  function iniciarCodigos() {
    $("#e-buscar").addEventListener("input", I.debounce(() => { eLimite = 60; pintarEtiquetas(); }, 250));
    $("#e-precio").addEventListener("change", pintarEtiquetas);
    $("#e-lista").addEventListener("click", async (ev) => {
      if (ev.target.id === "e-mas") { eLimite += 60; pintarEtiquetas(); return; }
      const card = ev.target.closest("[data-id]"); if (!card) return;
      const p = porId(card.dataset.id);
      if (ev.target.classList.contains("marca-sel")) { ev.target.checked ? marcadas.add(p.id) : marcadas.delete(p.id); card.classList.toggle("on", ev.target.checked); return; }
      const b = ev.target.closest("[data-a]"); if (!b) return;
      if (b.dataset.a === "png") descargarEtiqueta(p); else I.copiar(p.codigo_corto);
    });
    $("#e-todas").onclick = () => { filtrarEtiquetas().slice(0, eLimite).forEach((p) => marcadas.add(p.id)); pintarEtiquetas(); };
    $("#e-ninguna").onclick = () => { marcadas.clear(); pintarEtiquetas(); };
    const elegidas = () => activos().filter((p) => marcadas.has(p.id));
    $("#e-descargar").onclick = async () => {
      const l = elegidas();
      if (!l.length) return I.aviso("Marca al menos una etiqueta", "error");
      for (const p of l) { await descargarEtiqueta(p); await new Promise((r) => setTimeout(r, 350)); }
      I.aviso(l.length + " etiqueta(s) descargadas", "ok");
    };
    $("#e-imprimir").onclick = async () => {
      const l = elegidas();
      if (!l.length) return I.aviso("Marca al menos una etiqueta", "error");
      const copias = Math.min(50, Math.max(1, Number($("#e-copias").value) || 1));
      const imgs = [];
      for (const p of l) { const src = await imagenEtiqueta(p); for (let i = 0; i < copias; i++) imgs.push(src); }
      const marco = document.createElement("iframe");
      marco.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
      document.body.appendChild(marco);
      marco.contentDocument.write('<!doctype html><html><head><title>Etiquetas</title><style>@page{margin:8mm}body{margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}img{width:100%;break-inside:avoid}</style></head><body>' +
        imgs.map((s) => '<img src="' + s + '">').join("") + "</body></html>");
      marco.contentDocument.close();
      setTimeout(() => { marco.contentWindow.print(); setTimeout(() => marco.remove(), 60000); }, 500);
    };
  }

  // ============================================================== REPORTES (solo admin)
  let pTipo = "general", pDatos = [], pTabla = null;
  async function cargarReporte() {
    const r = await I.accion($("#p-ver"), () => I.llamar("remisiones", { desde: $("#p-desde").value, hasta: $("#p-hasta").value }));
    if (!r) return;
    pDatos = r.filter((x) => x.estado !== "anulada");
    llenarUno();
    pintarReporte();
  }
  function llenarUno() {
    const esCli = pTipo === "cliente1";
    $("#p-filtro-uno").hidden = !(esCli || pTipo === "producto1");
    $("#p-uno-etq").textContent = esCli ? "Cliente" : "Producto";
    const nombres = esCli ? [...new Set(pDatos.map((r) => r.cliente_nombre))] : [...new Set(pDatos.flatMap((r) => r.items.map((i) => i.nombre)))];
    $("#p-uno-lista").innerHTML = nombres.sort().map((n) => '<option value="' + e(n) + '">').join("");
  }
  function agrupar(lista, clave, valor) {
    const m = {};
    lista.forEach((x) => { const k = clave(x); if (k == null) return; m[k] = valor(m[k], x); });
    return m;
  }
  function pintarReporte() {
    const d = pDatos, sal = $("#p-salida");
    const total = d.reduce((s, r) => s + Number(r.total), 0);
    const items = d.flatMap((r) => r.items.map((i) => Object.assign({ rem: r }, i)));
    const rango = I.fecha($("#p-desde").value) + " al " + I.fecha($("#p-hasta").value);
    const porProducto = () => Object.values(agrupar(items, (i) => i.producto_id || "libre:" + i.nombre, (a, i) => {
      a = a || { nombre: i.nombre, unidad: i.unidad, cant: 0, imp: 0, rems: new Set() };
      a.cant += I.convertir(i.cantidad, i.unidad, a.unidad); a.imp += Number(i.importe); a.rems.add(i.rem.id); return a;
    })).sort((a, b) => b.imp - a.imp);
    const porCliente = () => Object.values(agrupar(d, (r) => r.cliente_nombre, (a, r) => {
      a = a || { nombre: r.cliente_nombre, n: 0, total: 0, pagado: 0, pend: 0, ultima: "" };
      a.n++; a.total += Number(r.total); a.pagado += Number(r.pagado || 0); a.pend += saldoDe(r); if (r.fecha > a.ultima) a.ultima = r.fecha; return a;
    })).sort((a, b) => b.total - a.total);
    const pct = (v) => total ? (100 * v / total).toFixed(1) + "%" : "0%";
    let html = "";
    pTabla = null;

    if (pTipo === "general") {
      const pag = d.reduce((s, r) => s + Number(r.pagado || 0), 0);
      const dias = Object.entries(agrupar(d, (r) => r.fecha, (a, r) => (a || 0) + Number(r.total))).sort((a, b) => a[0].localeCompare(b[0]));
      const abonosDe = (r) => (r.abonos && r.abonos.length ? r.abonos : Number(r.pagado) > 0 ? [{ metodo: r.metodo, monto: r.pagado }] : []);
      const met = Object.entries(agrupar(d.flatMap(abonosDe), (a) => I.METODOS[a.metodo] || "Sin método", (s, a) => (s || 0) + Number(a.monto))).sort((a, b) => b[1] - a[1]);
      const clientesUnicos = new Set(d.map((r) => r.cliente_nombre)).size;
      html = '<div class="kpis"><div class="kpi info"><span>Vendido</span><b>' + I.dinero(total) + "</b><small>" + d.length + ' remisiones</small></div><div class="kpi ok"><span>Cobrado</span><b>' + I.dinero(pag) +
        '</b></div><div class="kpi warn"><span>Por cobrar</span><b>' + I.dinero(total - pag) + '</b></div><div class="kpi"><span>Ticket promedio</span><b>' + I.dinero(d.length ? total / d.length : 0) + "</b><small>" + clientesUnicos + " clientes</small></div></div>" +
        '<div class="grid2"><div class="card"><div class="card-h"><h2>Ventas por día</h2></div>' + I.barrasH(dias.slice(-31).map(([f, v]) => ({ etq: I.fecha(f), valor: v })), "#38bdf8") + "</div>" +
        '<div class="card"><div class="card-h"><h2>Cobrado por método</h2></div>' + I.barrasH(met.map(([k, v]) => ({ etq: k, valor: v }))) + "</div>" +
        '<div class="card"><div class="card-h"><h2>Top 10 productos</h2></div>' + I.barrasH(porProducto().slice(0, 10).map((p) => ({ etq: p.nombre, valor: p.imp }))) + "</div>" +
        '<div class="card"><div class="card-h"><h2>Top 10 clientes</h2></div>' + I.barrasH(porCliente().slice(0, 10).map((c) => ({ etq: c.nombre, valor: c.total }))) + "</div></div>";
    } else if (pTipo === "productos") {
      const l = porProducto();
      pTabla = { nombre: "ventas_por_producto", cab: ["Producto", "Cantidad", "Unidad", "Remisiones", "Importe", "Precio prom.", "% del total"], filas: l.map((p) => [p.nombre, p.cant, uni(p.unidad), p.rems.size, p.imp, p.cant ? p.imp / p.cant : 0, pct(p.imp)]) };
      html = tabla(pTabla.cab, l.map((p) => ["<b>" + e(p.nombre) + "</b>", I.cifra(p.cant), uni(p.unidad), p.rems.size, I.dinero(p.imp), I.dinero(p.cant ? p.imp / p.cant : 0), pct(p.imp)]), [1, 3, 4, 5, 6]);
    } else if (pTipo === "clientes") {
      const l = porCliente();
      pTabla = { nombre: "ventas_por_cliente", cab: ["Cliente", "Remisiones", "Total", "Pagado", "Pendiente", "Última", "% del total"], filas: l.map((c) => [c.nombre, c.n, c.total, c.pagado, c.pend, c.ultima, pct(c.total)]) };
      html = tabla(pTabla.cab, l.map((c) => ["<b>" + e(c.nombre) + "</b>", c.n, I.dinero(c.total), I.dinero(c.pagado), c.pend ? '<span class="stock-bajo">' + I.dinero(c.pend) + "</span>" : I.dinero(0), I.fecha(c.ultima), pct(c.total)]), [1, 2, 3, 4, 6]);
    } else if (pTipo === "cliente1" || pTipo === "producto1") {
      const q = $("#p-uno").value.trim();
      if (!q) html = '<p class="vacio">Escribe o elige ' + (pTipo === "cliente1" ? "un cliente" : "un producto") + " arriba</p>";
      else if (pTipo === "cliente1") {
        const suyas = d.filter((r) => I.norm(r.cliente_nombre) === I.norm(q));
        const its = suyas.flatMap((r) => r.items.map((i) => Object.assign({ rem: r }, i)));
        const prods = Object.values(agrupar(its, (i) => i.nombre, (a, i) => { a = a || { nombre: i.nombre, unidad: i.unidad, cant: 0, imp: 0 }; a.cant += I.convertir(i.cantidad, i.unidad, a.unidad); a.imp += Number(i.importe); return a; })).sort((a, b) => b.imp - a.imp);
        const t = suyas.reduce((s, r) => s + Number(r.total), 0), pend = suyas.reduce((s, r) => s + saldoDe(r), 0);
        pTabla = { nombre: "cliente_" + I.nombreArchivo(q), cab: ["Nº", "Fecha", "Producto", "Cantidad", "Unidad", "P. unit.", "Importe", "Estado"], filas: its.map((i) => [i.rem.numero, i.rem.fecha, i.nombre, i.cantidad, uni(i.unidad), i.precio, i.importe, i.rem.estado]) };
        html = "<h3>" + e(q) + '</h3><div class="kpis"><div class="kpi info"><span>Compró</span><b>' + I.dinero(t) + "</b><small>" + suyas.length + ' remisiones</small></div><div class="kpi warn"><span>Pendiente</span><b>' + I.dinero(pend) + "</b></div></div>" +
          '<h4 style="margin:8px 0">Productos</h4>' + tabla(["Producto", "Cantidad", "Importe"], prods.map((p) => [e(p.nombre), I.cifra(p.cant) + " " + uni(p.unidad), I.dinero(p.imp)]), [1, 2]) +
          '<h4 style="margin:14px 0 8px">Remisiones</h4>' + tabla(["Nº", "Fecha", "Estado", "Total"], suyas.map((r) => [r.numero, I.fecha(r.fecha), I.chipEstado(r.estado), I.dinero(r.total)]), [3]);
      } else {
        const its = items.filter((i) => I.norm(i.nombre) === I.norm(q));
        const cl = Object.values(agrupar(its, (i) => i.rem.cliente_nombre, (a, i) => { a = a || { nombre: i.rem.cliente_nombre, cant: 0, imp: 0, n: 0 }; a.cant += I.convertir(i.cantidad, i.unidad, its[0].unidad); a.imp += Number(i.importe); a.n++; return a; })).sort((a, b) => b.cant - a.cant);
        const u = its[0] ? uni(its[0].unidad) : "";
        pTabla = { nombre: "producto_" + I.nombreArchivo(q), cab: ["Nº", "Fecha", "Cliente", "Cantidad", "P. unit.", "P. lista", "Importe"], filas: its.map((i) => [i.rem.numero, i.rem.fecha, i.rem.cliente_nombre, i.cantidad, i.precio, i.precio_lista ?? "", i.importe]) };
        html = "<h3>" + e(q) + '</h3><div class="kpis"><div class="kpi info"><span>Vendido</span><b>' + I.cifra(its.reduce((s, i) => s + I.convertir(i.cantidad, i.unidad, its[0].unidad), 0)) + " " + u + '</b></div><div class="kpi ok"><span>Importe</span><b>' +
          I.dinero(its.reduce((s, i) => s + Number(i.importe), 0)) + '</b></div><div class="kpi"><span>Clientes</span><b>' + cl.length + "</b></div></div>" +
          '<h4 style="margin:8px 0">Quién lo compra</h4>' + tabla(["Cliente", "Veces", "Cantidad", "Importe"], cl.map((c) => [e(c.nombre), c.n, I.cifra(c.cant) + " " + u, I.dinero(c.imp)]), [1, 2, 3]) +
          '<h4 style="margin:14px 0 8px">Ventas</h4>' + tabla(["Nº", "Fecha", "Cliente", "Cantidad", "P. unit.", "Importe"], its.map((i) => [i.rem.numero, I.fecha(i.rem.fecha), e(i.rem.cliente_nombre), I.cifra(i.cantidad) + " " + uni(i.unidad), precioTxt(i.precio) + (i.precio_unidad && i.precio_unidad !== i.unidad ? "/" + uni(i.precio_unidad) : ""), I.dinero(i.importe)]), [3, 4, 5]);
      }
    } else if (pTipo === "vendedores") {
      const l = Object.values(agrupar(d, (r) => r.vendedor_nombre || "—", (a, r) => { a = a || { nombre: r.vendedor_nombre || "—", n: 0, total: 0, pend: 0 }; a.n++; a.total += Number(r.total); a.pend += saldoDe(r); return a; })).sort((a, b) => b.total - a.total);
      pTabla = { nombre: "ventas_por_vendedor", cab: ["Vendedor", "Remisiones", "Total", "Pendiente", "% del total"], filas: l.map((v) => [v.nombre, v.n, v.total, v.pend, pct(v.total)]) };
      html = tabla(pTabla.cab, l.map((v) => ["<b>" + e(v.nombre) + "</b>", v.n, I.dinero(v.total), I.dinero(v.pend), pct(v.total)]), [1, 2, 3, 4]);
    } else if (pTipo === "precios") {
      const l = items.filter((i) => i.precio_lista != null && Number(i.precio) !== Number(i.precio_lista));
      const dif = l.reduce((s, i) => s + (Number(i.precio) - Number(i.precio_lista)) * cantPrecio(i), 0);
      pTabla = { nombre: "precios_cambiados", cab: ["Nº", "Fecha", "Cliente", "Producto", "Cantidad", "P. lista", "P. cobrado", "Diferencia"], filas: l.map((i) => [i.rem.numero, i.rem.fecha, i.rem.cliente_nombre, i.nombre, i.cantidad, i.precio_lista, i.precio, (i.precio - i.precio_lista) * cantPrecio(i)]) };
      html = '<p class="muted">Renglones donde se cobró distinto al precio de lista. Efecto total: <b>' + I.dinero(dif) + "</b></p>" +
        tabla(pTabla.cab, l.map((i) => [i.rem.numero, I.fecha(i.rem.fecha), e(i.rem.cliente_nombre), e(i.nombre), I.cifra(i.cantidad), I.dinero(i.precio_lista), I.dinero(i.precio), I.dinero((i.precio - i.precio_lista) * cantPrecio(i))]), [4, 5, 6, 7]);
    }
    sal.innerHTML = '<p class="muted" style="margin-top:0">Del ' + rango + " · sin contar anuladas" + (pTabla ? ' · <button class="btn mini" id="p-csv" type="button">CSV de esta tabla</button>' : "") + "</p>" + html;
    const bc = $("#p-csv");
    if (bc) bc.onclick = () => I.csv(pTabla.nombre + "_" + I.hoy(), [pTabla.cab].concat(pTabla.filas));
  }
  function iniciarReportes() {
    const [d, h] = rangoRapido("mes");
    $("#p-desde").value = d; $("#p-hasta").value = h;
    $("#p-rapido").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-r]"); if (!b) return;
      $$("#p-rapido button").forEach((x) => x.classList.toggle("on", x === b));
      const [a, z] = rangoRapido(b.dataset.r); $("#p-desde").value = a; $("#p-hasta").value = z;
      cargarReporte();
    });
    $("#p-ver").onclick = cargarReporte;
    $("#p-tipo").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-t]"); if (!b) return;
      pTipo = b.dataset.t; $$("#p-tipo button").forEach((x) => x.classList.toggle("on", x === b));
      llenarUno(); pintarReporte();
    });
    $("#p-uno").addEventListener("input", I.debounce(pintarReporte, 300));
    $("#p-imprimir").onclick = () => {
      const marco = document.createElement("iframe");
      marco.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
      document.body.appendChild(marco);
      const titulo = $("#p-tipo .on").textContent;
      marco.contentDocument.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte ' + e(titulo) + '</title><style>body{font:12px Arial,sans-serif;color:#111;margin:10mm}h1{font-size:18px;margin:0}h2,h3,h4{font-size:14px;margin:12px 0 6px}' +
        "table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f1f5f9}.kpis{display:flex;gap:8px;flex-wrap:wrap}.kpi{border:1px solid #ccc;border-radius:8px;padding:6px 10px}.kpi span,.kpi small{display:block;color:#555;font-size:11px}.kpi b{font-size:16px}" +
        ".grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.card{border:1px solid #ddd;border-radius:8px;padding:8px;break-inside:avoid}.bh-fila{display:grid;grid-template-columns:140px 1fr 90px;gap:6px;align-items:center;margin:3px 0}.bh-pista{background:#eee;height:10px;border-radius:5px;overflow:hidden;display:block}.bh-barra{display:block;height:100%}.bh-val{text-align:right}.chip{font-weight:700}button{display:none}</style></head><body>" +
        "<h1>" + e(neg.nombre) + " · Reporte: " + e(titulo) + "</h1>" + $("#p-salida").innerHTML + "</body></html>");
      marco.contentDocument.close();
      setTimeout(() => { marco.contentWindow.print(); setTimeout(() => marco.remove(), 60000); }, 300);
    };
  }

  // ============================================================== AJUSTES
  let logoNuevo;
  const EJEMPLO = {
    numero: 3751, fecha: I.hoy(), cliente_nombre: "Yesenia Mercado", direccion: "Calle Ejemplo 123", ciudad: "Monterrey", documento: "", total: 31400, estado: "pendiente",
    items: [{ cantidad: 200, unidad: "kg", nombre: "Ajo molido p.", precio: 49, importe: 9800, orden: 1 }, { cantidad: 75, unidad: "kg", nombre: "Ajo granulado", precio: 68, importe: 5100, orden: 2 },
      { cantidad: 250, unidad: "kg", nombre: "Pimienta molida p.", precio: 66, importe: 16500, orden: 3 }],
  };
  function negDelForm() {
    const d = Object.fromEntries(new FormData($("#a-neg")));
    return Object.assign({}, neg, d, { logo: logoNuevo !== undefined ? logoNuevo : neg.logo, logo2: logo2Nuevo !== undefined ? logo2Nuevo : neg.logo2 });
  }
  let logo2Nuevo;
  function pintarLogo(src) { $("#a-logo-caja").innerHTML = src ? '<img src="' + e(src) + '" alt="Logo del negocio">' : "<span>Sin logo</span>"; }
  function pintarLogo2(src) { $("#a-logo2-caja").innerHTML = src ? '<img src="' + e(src) + '" alt="Segundo logo">' : "<span>Sin logo 2</span>"; }
  const previa = I.debounce(() => R.vistaPrevia($("#a-vista"), negDelForm(), EJEMPLO), 350);
  async function pintarUsuarios() {
    const l = await I.accion(null, () => I.llamar("usuarios"));
    if (!l) return;
    $("#a-usuarios").innerHTML = l.map((u) => '<div class="item" data-id="' + u.id + '"><div class="principal"><b>' + e(u.nombre || u.usuario) + "</b><small>" + e(u.usuario) + " · " + (u.rol === "admin" ? "Administrador" : "Vendedor") +
      '</small></div><span class="chip ' + (u.estado === "activo" ? "ok" : "mal") + '">' + (u.estado === "activo" ? "Activo" : "Bloqueado") + '</span><div class="acc"><button class="btn mini" data-a="clave" type="button">Clave</button>' +
      '<button class="btn mini ' + (u.estado === "activo" ? "peligro" : "ok") + '" data-a="estado" data-e="' + (u.estado === "activo" ? "bloqueado" : "activo") + '" type="button">' + (u.estado === "activo" ? "Bloquear" : "Activar") + "</button></div></div>").join("");
  }
  function iniciarAjustes() {
    $("#a-clave").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (await I.accion(ev.target.querySelector("[type=submit]"), () => I.llamar("mi_clave", Object.fromEntries(new FormData(ev.target))), "Clave cambiada")) ev.target.reset();
    });
    if (!ADMIN) return;
    const f = $("#a-neg");
    ["nombre", "razon", "lema", "direccion", "ciudad", "telefono", "celular", "etiqueta_doc", "documento", "moneda", "color", "sig_remision", "pie"].forEach((k) => { f.elements[k].value = neg[k] ?? ""; });
    if (!neg.color) f.elements.color.value = "#1f2937";
    pintarLogo(neg.logo);
    f.addEventListener("input", previa);
    $("#a-logo").addEventListener("change", async (ev) => {
      const arch = ev.target.files[0]; if (!arch) return;
      try { logoNuevo = await I.imagenReducida(arch, 480); pintarLogo(logoNuevo); previa(); I.aviso("Logo listo. Pulsa Guardar.", "info"); }
      catch (err) { I.aviso(err.message, "error"); }
      ev.target.value = "";
    });
    $("#a-logo-quitar").onclick = () => { logoNuevo = ""; pintarLogo(""); previa(); };
    pintarLogo2(neg.logo2);
    $("#a-logo2").addEventListener("change", async (ev) => {
      const arch = ev.target.files[0]; if (!arch) return;
      try { logo2Nuevo = await I.imagenReducida(arch, 480); pintarLogo2(logo2Nuevo); previa(); I.aviso("Logo 2 listo. Pulsa Guardar.", "info"); }
      catch (err) { I.aviso(err.message, "error"); }
      ev.target.value = "";
    });
    $("#a-logo2-quitar").onclick = () => { logo2Nuevo = ""; pintarLogo2(""); previa(); };
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      if (Number(d.sig_remision) === Number(neg.sig_remision)) delete d.sig_remision;
      if (logoNuevo !== undefined) d.logo = logoNuevo;
      if (logo2Nuevo !== undefined) d.logo2 = logo2Nuevo;
      if (await I.accion(f.querySelector("[type=submit]"), () => I.llamar("neg_guardar", d), "Datos guardados")) { logoNuevo = undefined; logo2Nuevo = undefined; await cargarNegocio(); }
    });
    previa();
    pintarUsuarios();
    $("#a-usr-nuevo").onclick = () => I.modal('<h3>Nuevo usuario</h3><form class="pila"><div class="campos"><label class="campo"><span>Nombre</span><input name="nombre" maxlength="80"></label>' +
      '<label class="campo"><span>Usuario</span><input name="usuario" required autocapitalize="none"></label><label class="campo"><span>Clave</span><input name="clave" required minlength="4"></label>' +
      '<label class="campo"><span>Rol</span><select name="rol"><option value="vendedor">Vendedor</option><option value="admin">Administrador</option></select></label></div>' +
      '<div class="fila-btns"><button class="btn primario" type="submit">Crear</button></div></form>', (m, cerrar) => {
      m.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(ev.target));
        if (await I.accion(ev.target.querySelector("[type=submit]"), () => I.llamar("usr_crear", d), "Usuario creado")) {
          cerrar(); pintarUsuarios();
          const t = "Acceso: " + location.href.replace(/0021_panel\.html.*$/, "0021_inicio.html") + "\nUsuario: " + d.usuario.toLowerCase() + "\nClave: " + d.clave;
          I.modal('<h3>Comparte el acceso</h3><pre class="sub" style="white-space:pre-wrap;margin:0">' + e(t) + '</pre><div class="fila-btns"><button class="btn primario" type="button" data-c>Copiar</button></div>', (m2) => { m2.querySelector("[data-c]").onclick = () => I.copiar(t); });
        }
      };
    });
    $("#a-usuarios").addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-a]"); if (!b) return;
      const id = b.closest("[data-id]").dataset.id;
      if (b.dataset.a === "estado") {
        if (b.dataset.e === "bloqueado" && !(await I.confirmar("Ese usuario no podrá entrar hasta que lo actives.", "Bloquear", true))) return;
        if (await I.accion(b, () => I.llamar("usr_estado", { id, estado: b.dataset.e }), "Listo")) pintarUsuarios();
      } else {
        I.modal('<h3>Nueva clave</h3><form class="pila"><label class="campo"><span>Clave</span><input name="clave" required minlength="4"></label><div class="fila-btns"><button class="btn primario" type="submit">Cambiar</button></div></form>', (m, cerrar) => {
          m.querySelector("form").onsubmit = async (e2) => {
            e2.preventDefault();
            if (await I.accion(e2.target.querySelector("[type=submit]"), () => I.llamar("usr_clave", { id, clave: new FormData(e2.target).get("clave") }), "Clave cambiada")) cerrar();
          };
        });
      }
    });
  }

  // ============================================================== arranque
  function alCambiarTab(id) {
    tabActual = id;
    if (id !== "vender") detenerCamara();
    if (id === "vender") setTimeout(() => $("#v-buscar").focus(), 50);
    if (id === "remisiones") cargarRemisiones();
    if (id === "inventario") pintarInventario();
    if (id === "clientes") pintarClientes();
    if (id === "codigos") pintarEtiquetas();
    if (id === "reportes" && !pDatos.length) cargarReporte();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("#salir").onclick = () => I.salir();
    if (!ADMIN) $$("[data-solo-admin]").forEach((x) => { x.hidden = true; });
    llenarMetodos();
    try {
      await cargarNegocio();
      await Promise.all([cargarProductos(), cargarClientes(), cargarPendientes()]);
    } catch (err) { I.aviso(err.message, "error"); return; }
    iniciarVender(); iniciarRemisiones(); iniciarInventario(); iniciarClientes(); iniciarCodigos(); iniciarAjustes();
    if (ADMIN) iniciarReportes();
    I.pestanas(document, alCambiarTab);
    cargarVendido30().then(() => { if (tabActual === "inventario") pintarInventario(); }).catch(() => {});

    I.refrescoVivo(async () => {
      await Promise.all([cargarProductos(), cargarClientes(), cargarPendientes()]);
      if (tabActual === "vender") { pintarCarrito(); if ($("#v-buscar").value) { resultados = candidatos($("#v-buscar").value); pintarResultados(); } }
      if (tabActual === "remisiones") await cargarRemisiones();
      if (tabActual === "inventario") pintarInventario();
      if (tabActual === "clientes") pintarClientes();
    }, 60000);
  });
})();
