document.addEventListener("DOMContentLoaded", () => {
  const btnFull = document.getElementById('btnToggleFullscreen');
  if (!btnFull) return;

  btnFull.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => {
          btnFull.textContent = 'pantalla normal';
        })
        .catch(err => {
          console.error(`Error al activar pantalla completa: ${err.message}`);
        });
    } else {
      document.exitFullscreen();
      btnFull.textContent = 'pantalla completa';
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      btnFull.textContent = 'pantalla completa';
    } else {
      btnFull.textContent = 'pantalla normal';
    }
  });
});