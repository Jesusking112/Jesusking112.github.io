(function () {
  "use strict";
  document.documentElement.style.visibility = "hidden";

  document.addEventListener("DOMContentLoaded", async () => {
    if (!window.Plataforma) {
      document.documentElement.style.visibility = "visible";
      alert("Error de carga: modulo_conexion.js debe incluirse antes que acceso_2.js");
      return;
    }
    const ok = await window.Plataforma.protegerPagina([1, 4]);
    if (ok && typeof window.Plataforma.iniciarCrearUsuarios === "function"
        && document.getElementById("btnGuardar")) {
      window.Plataforma.iniciarCrearUsuarios();
    }
  });
})();
