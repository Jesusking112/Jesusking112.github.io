/* =====================================================================
   ACCESO_2.JS  -  Guard para paginas de usuarios y administradores
   (Modo 1 o 2). La verificacion real la hace el SERVIDOR.
   Requiere que modulo_conexion.js se cargue ANTES que este archivo.
   ===================================================================== */
(function () {
  "use strict";
  document.documentElement.style.visibility = "hidden";

  document.addEventListener("DOMContentLoaded", async () => {
    if (!window.Plataforma) {
      document.documentElement.style.visibility = "visible";
      alert("Error de carga: modulo_conexion.js debe incluirse antes que acceso_2.js");
      return;
    }
    const ok = await window.Plataforma.protegerPagina([1, 2]);
    if (ok && typeof window.Plataforma.iniciarCrearUsuarios === "function"
        && document.getElementById("btnGuardar")) {
      window.Plataforma.iniciarCrearUsuarios();
    }
  });
})();
