// Pases QR del módulo 006: dibujar QR, armar la tarjeta del invitado y leer QR con la cámara.
// Usa qrcode-generator (casa) y jsQR (portería) desde CDN; el lector nativo del celular va primero.
(function () {
  "use strict";
  const C = window.Conj;

  // ---------------------------------------------------------------- dibujar QR
  function dibujarQR(canvas, texto, lado) {
    if (!window.qrcode) throw new Error("El generador de QR no cargó. Revisa tu internet.");
    const q = window.qrcode(0, "M");
    q.addData(texto); q.make();
    const n = q.getModuleCount(), borde = 2, celda = Math.floor(lado / (n + borde * 2));
    const tam = celda * (n + borde * 2);
    canvas.width = tam; canvas.height = tam;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, tam, tam);
    ctx.fillStyle = "#0b1530";
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (q.isDark(f, c)) ctx.fillRect((c + borde) * celda, (f + borde) * celda, celda, celda);
    return canvas;
  }

  const fh = (iso) => new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const grupos = (c) => String(c).replace(/(\d{4})(?=\d)/g, "$1 ");

  function partirTexto(ctx, texto, ancho) {
    const palabras = String(texto).split(/\s+/), lineas = [];
    let l = "";
    palabras.forEach((p) => { const t = l ? l + " " + p : p; if (ctx.measureText(t).width > ancho && l) { lineas.push(l); l = p; } else l = t; });
    if (l) lineas.push(l);
    return lineas;
  }
  function redondo(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------------------------------------------------------------- tarjeta del invitado (imagen PNG)
  // p: { codigo, nombre, documento, placa, tipo, desde, hasta, casa, por, conjunto, nota }
  function tarjetaInvitado(p) {
    const W = 720, cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    const filas = [
      ["Invitado", p.nombre], ["Documento", p.documento], ["Placa", p.placa], ["Tipo", p.tipo],
      ["Va a la casa", p.casa], ["Lo invita", p.por], ["Nota", p.nota],
    ].filter((x) => x[1]);
    cv.width = W; cv.height = 1180 + filas.length * 6;
    ctx.fillStyle = "#070d1c"; ctx.fillRect(0, 0, W, cv.height);
    const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "#38bdf8"); g.addColorStop(1, "#2dd4bf");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 10);

    ctx.textAlign = "center"; ctx.fillStyle = "#93a4bf"; ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText("PASE DE INVITADO", W / 2, 62);
    ctx.fillStyle = "#f1f5fb"; ctx.font = "800 36px system-ui, sans-serif";
    partirTexto(ctx, p.conjunto || "Conjunto", W - 80).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 110 + i * 42));

    const lado = 420, qx = (W - lado) / 2, qy = 170;
    redondo(ctx, qx - 22, qy - 22, lado + 44, lado + 44, 26); ctx.fillStyle = "#ffffff"; ctx.fill();
    const q = dibujarQR(document.createElement("canvas"), p.codigo, lado);
    ctx.drawImage(q, qx, qy, lado, lado);

    let y = qy + lado + 76;
    ctx.fillStyle = "#38bdf8"; ctx.font = "800 40px ui-monospace, monospace";
    ctx.fillText(grupos(p.codigo), W / 2, y);
    y += 30; ctx.fillStyle = "#93a4bf"; ctx.font = "500 19px system-ui, sans-serif";
    ctx.fillText("Si la cámara falla, el portero puede escribir este código", W / 2, y);

    y += 30; redondo(ctx, 40, y, W - 80, 92, 18); ctx.fillStyle = "#0f1a30"; ctx.fill();
    ctx.strokeStyle = "#2dd4bf"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#2dd4bf"; ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText("Puede entrar y salir las veces que necesite", W / 2, y + 34);
    ctx.fillStyle = "#f1f5fb"; ctx.font = "600 21px system-ui, sans-serif";
    ctx.fillText("Del " + fh(p.desde) + "  al  " + fh(p.hasta), W / 2, y + 68);

    y += 130; ctx.textAlign = "left";
    filas.forEach(([k, v]) => {
      ctx.fillStyle = "#93a4bf"; ctx.font = "600 21px system-ui, sans-serif"; ctx.fillText(k, 56, y);
      ctx.fillStyle = "#f1f5fb"; ctx.font = "700 24px system-ui, sans-serif";
      const ls = partirTexto(ctx, v, W - 290).slice(0, 2);
      ls.forEach((l, i) => ctx.fillText(l, 240, y + i * 30));
      y += 22 + ls.length * 30;
    });

    y = Math.max(y + 10, cv.height - 110);
    ctx.fillStyle = "#233250"; ctx.fillRect(40, y, W - 80, 2);
    ctx.textAlign = "center"; ctx.fillStyle = "#93a4bf"; ctx.font = "500 20px system-ui, sans-serif";
    ctx.fillText("Muestra este QR y tu documento en portería.", W / 2, y + 40);
    ctx.fillText("Respeta al peatón y la velocidad dentro del conjunto.", W / 2, y + 70);
    return cv;
  }

  const aBlob = (cv) => new Promise((ok) => cv.toBlob(ok, "image/png"));
  function descargar(cv, nombre) {
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png"); a.download = nombre + ".png"; a.click();
  }
  // En el celular abre el menú de compartir con la imagen (eliges WhatsApp). Devuelve false si no se puede.
  async function compartirImagen(cv, nombre, texto) {
    try {
      const archivo = new File([await aBlob(cv)], nombre + ".png", { type: "image/png" });
      if (!navigator.canShare || !navigator.canShare({ files: [archivo] })) return false;
      await navigator.share({ files: [archivo], text: texto });
      return true;
    } catch (e) { return e && e.name === "AbortError"; }
  }

  // ---------------------------------------------------------------- escáner QR
  function escaner(caja, alLeer) {
    let flujo = null, video = null, on = false, raf = 0, det = null, lienzo = null, ctx = null;
    let ultimo = "", ultimoT = 0;
    async function iniciar() {
      if (!navigator.mediaDevices) throw new Error("Este navegador no permite usar la cámara (usa https).");
      if ("BarcodeDetector" in window) {
        try { const f = await window.BarcodeDetector.getSupportedFormats(); if (f.includes("qr_code")) det = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (_e) { det = null; }
      }
      if (!det && !window.jsQR) throw new Error("El lector QR no cargó. Revisa tu internet.");
      flujo = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
      video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.setAttribute("playsinline", ""); video.srcObject = flujo;
      caja.prepend(video);
      await video.play();
      if (!det) { lienzo = document.createElement("canvas"); ctx = lienzo.getContext("2d", { willReadFrequently: true }); }
      on = true;
      let ocupado = false, t0 = 0;
      const ciclo = async (t) => {
        if (!on) return;
        raf = requestAnimationFrame(ciclo);
        if (ocupado || t - t0 < 220 || video.readyState < 2) return;
        t0 = t; ocupado = true;
        try {
          let v = null;
          if (det) { const r = await det.detect(video); if (r.length) v = r[0].rawValue; }
          else {
            const w = 520, h = Math.round(w * (video.videoHeight / video.videoWidth)) || 390;
            lienzo.width = w; lienzo.height = h; ctx.drawImage(video, 0, 0, w, h);
            const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
            if (r) v = r.data;
          }
          const ahora = Date.now();
          if (v && on && !(v === ultimo && ahora - ultimoT < 2500)) { ultimo = v; ultimoT = ahora; alLeer(v); }
        } catch (_e) { /* cuadro perdido */ }
        ocupado = false;
      };
      raf = requestAnimationFrame(ciclo);
    }
    function detener() {
      on = false; cancelAnimationFrame(raf);
      if (flujo) flujo.getTracks().forEach((t) => t.stop());
      flujo = null; if (video) video.remove(); video = null;
    }
    return { iniciar, detener, activo: () => on };
  }

  C.pases = { dibujarQR, tarjetaInvitado, descargar, compartirImagen, escaner, fh, grupos };
})();
