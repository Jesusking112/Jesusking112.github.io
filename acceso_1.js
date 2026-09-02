/* =====================================================================
   ACCESO_1.JS  -  Guard para paginas SOLO de administradores (Modo 1).
   Requiere que modulo_conexion.js se cargue ANTES que este archivo.
   ===================================================================== */
(function () {
  "use strict";
  document.documentElement.style.visibility = "hidden";

  document.addEventListener("DOMContentLoaded", async () => {
    if (!window.Plataforma) {
      document.documentElement.style.visibility = "visible";
      alert("Error de carga: modulo_conexion.js debe incluirse antes que acceso_1.js");
      return;
    }
    const ok = await window.Plataforma.protegerPagina([1]);
    if (ok && typeof window.Plataforma.iniciarCrearUsuarios === "function"
        && document.getElementById("btnGuardar")) {
      window.Plataforma.iniciarCrearUsuarios();
    }
  });
})();
