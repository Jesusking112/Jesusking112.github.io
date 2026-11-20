(function () {
  "use strict";
  const C = window.Conj;

  // Sesión persistente: si ya hay token válido, entra directo a su panel.
  if (C.hayToken() && C.PAGINA[C.rol()] && C.rol() !== "creador") {
    C.llamar("yo").then((r) => { location.replace(C.PAGINA[r.rol]); }).catch(() => {});
  }

  const BLOQUEO = /venci|suspend|suscrip/i;
  function mostrarMotivo(texto) {
    const b = C.$("#motivo");
    b.innerHTML = "<span>" + C.esc(texto) + "</span>" +
      (BLOQUEO.test(texto) ? '<button class="btn mini primario" type="button" id="ver-pago">¿Eres el administrador? Ver cómo renovar</button>' : "");
    b.hidden = false;
    const ver = C.$("#ver-pago");
    if (ver) ver.onclick = verPago;
  }
  async function verPago(e) {
    const r = await C.accion(e.currentTarget, () => C.llamar("pago_plataforma"));
    if (!r) return;
    C.modal('<h3>Renueva tu suscripción</h3><p class="muted">Paga con estos datos y envía el comprobante. Al confirmarse, el acceso se reactiva solo.</p>' +
      C.tarjetaPago(r) + (r.whatsapp ? '<div class="fila-btns"><a class="btn wa" target="_blank" rel="noopener" href="' +
      C.whatsapp(r.whatsapp, "Hola, soy administrador de un conjunto y quiero renovar la suscripción. Te envío el comprobante.") + '">Enviar comprobante por WhatsApp</a></div>' : ""),
      (m) => C.enlazarCopiar(m));
  }

  const motivo = sessionStorage.getItem("conj006_motivo");
  if (motivo) {
    mostrarMotivo(motivo);
    sessionStorage.removeItem("conj006_motivo");
  }

  const clave = C.$("[name=clave]");
  C.$("#ver").addEventListener("click", (e) => {
    const ver = clave.type === "password";
    clave.type = ver ? "text" : "password";
    e.currentTarget.textContent = ver ? "Ocultar" : "Ver";
  });

  C.$("#f-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    let fallo = "";
    const r = await C.accion(f.querySelector("button[type=submit]"), async () => {
      try { return await C.llamar("login", { usuario: f.usuario.value, clave: f.clave.value }); }
      catch (x) { fallo = x.message; throw x; }
    });
    if (!r) { if (BLOQUEO.test(fallo)) mostrarMotivo(fallo); return; }
    C.guardarSesion(r);
    location.href = C.PAGINA[r.rol];
  });
})();
