// Funci�n para mostrar una alerta al cargar la p�gina
function mostrarAlerta() {
    alert('No acepta videos con derecho de autor');
}

// Funci�n para reproducir el video de YouTube
function playYouTubeVideo(videoId) {
    var playerDiv = document.getElementById('player');
    playerDiv.innerHTML = '<iframe width="560" height="315" src="https://www.youtube.com/embed/' + videoId + '?autoplay=1&controls=0&showinfo=0" frameborder="0" allowfullscreen allow="autoplay" title=""></iframe>';
}

// Función para actualizar el cronómetro
function updateClock() {
    var now = new Date();
    var hours = now.getHours();
    var minutes = now.getMinutes();
    var seconds = now.getSeconds();

    // Formato de 2 dígitos con ceros a la izquierda si es necesario
    var formattedTime = padNumber(hours) + ":" + padNumber(minutes) + ":" + padNumber(seconds);

    // Actualizar el contenido del cronómetro
    var cronometro = document.getElementById('cronometro');
    if (cronometro) {
        cronometro.textContent = formattedTime;
    }
}

// Función auxiliar para añadir ceros a la izquierda si el número es menor que 10
function padNumber(num) {
    return (num < 10 ? '0' : '') + num;
}

// Actualizar el cronómetro cada segundo
setInterval(updateClock, 1000);

// Función para verificar la conexión a internet
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
