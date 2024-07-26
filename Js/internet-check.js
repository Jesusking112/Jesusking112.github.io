// Contenido de internet-check.js
function checkInternetConnection() {
    function redirectToIndex() {
        window.location.href = 'index.html'; // Redirige a index.html cuando no hay conexión
    }

    if (!navigator.onLine) {
        redirectToIndex(); // Si no hay conexión al cargar la página, redirige a index.html
    }

    window.addEventListener('online', function() {
        redirectToIndex(); // Cuando se detecta conexión, redirige a index.html
    });

    window.addEventListener('offline', function() {
        redirectToIndex(); // Cuando se pierde la conexión, redirige a index.html
    });
}

document.addEventListener('DOMContentLoaded', checkInternetConnection);
