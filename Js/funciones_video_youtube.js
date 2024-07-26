// Funci髇 para mostrar una alerta al cargar la p醙ina
function mostrarAlerta() {
    alert('No acepta videos con derecho de autor');
}

// Funci梟 para reproducir el video de YouTube
function playYouTubeVideo(videoId) {
    var playerDiv = document.getElementById('player');
    playerDiv.innerHTML = '<iframe width="560" height="315" src="https://www.youtube.com/embed/' + videoId + '?autoplay=1&controls=0&showinfo=0" frameborder="0" allowfullscreen allow="autoplay" title=""></iframe>';
}

// Funci贸n para actualizar el cron贸metro
function updateClock() {
    var now = new Date();
    var hours = now.getHours();
    var minutes = now.getMinutes();
    var seconds = now.getSeconds();

    // Formato de 2 d铆gitos con ceros a la izquierda si es necesario
    var formattedTime = padNumber(hours) + ":" + padNumber(minutes) + ":" + padNumber(seconds);

    // Actualizar el contenido del cron贸metro
    var cronometro = document.getElementById('cronometro');
    if (cronometro) {
        cronometro.textContent = formattedTime;
    }
}

// Funci贸n auxiliar para a帽adir ceros a la izquierda si el n煤mero es menor que 10
function padNumber(num) {
    return (num < 10 ? '0' : '') + num;
}

// Actualizar el cron贸metro cada segundo
setInterval(updateClock, 1000);

// Funci贸n para verificar la conexi贸n a internet
function checkInternetConnection() {
    var pageTitle = document.getElementById('pageTitle');
    var inicioLink = document.getElementById('inicioLink');
    
    function updateTitleAndLink(online) {
        pageTitle.textContent = online ? 'Videos' : 'No hay internet';
        if (online) {
            inicioLink.innerHTML = '<a href="index.html">Inicio</a>';
        } else {
            inicioLink.innerHTML = '<b>Bloqueado</b>';
        }
    }

    if (navigator.onLine) {
        updateTitleAndLink(true);
    } else {
        updateTitleAndLink(false);
    }

    window.addEventListener('online', function() {
        updateTitleAndLink(true);
    });

    window.addEventListener('offline', function() {
        updateTitleAndLink(false);
    });
}

document.addEventListener('DOMContentLoaded', checkInternetConnection);
