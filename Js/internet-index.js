function checkInternetConnection() {
    var navItems = document.querySelectorAll('.nav-items li');
    var noInternetButton = document.getElementById('noInternetButton');

    function updateNavigation(online) {
        if (online) {
            // Mostrar los elementos de la navegación
            navItems.forEach(function(item) {
                item.style.display = 'inline-block';
            });
            noInternetButton.style.display = 'none'; // Ocultar el botón "No hay internet"
        } else {
            // Ocultar los elementos de la navegación
            navItems.forEach(function(item) {
                item.style.display = 'none';
            });
            noInternetButton.style.display = 'inline-block'; // Mostrar el botón "No hay internet"
        }
    }

    if (navigator.onLine) {
        updateNavigation(true);
    } else {
        updateNavigation(false);
    }
    
    window.addEventListener('online', function() {
        updateNavigation(true);
    });

    window.addEventListener('offline', function() {
        updateNavigation(false);
    });
}
    
document.addEventListener('DOMContentLoaded', checkInternetConnection);
