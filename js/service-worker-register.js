// public/js/service-worker-register.js
// VERSIÓN SIMPLIFICADA PARA ACTUALIZACIONES AUTOMÁTICAS Y SILENCIOSAS

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('[SW Register] Service Worker registrado con éxito.');

        // No es necesario hacer nada más en la instalación,
        // ya que el propio service-worker.js se encarga de llamar a skipWaiting().
        registration.onupdatefound = () => {
          console.log(
            '[SW Register] Nueva versión del Service Worker encontrada. Se instalará en segundo plano.'
          );
        };
      })
      .catch((error) => {
        console.error('[SW Register] Fallo en el registro del Service Worker:', error);
      });

    // LA CLAVE: Este evento se dispara cuando un nuevo Service Worker toma el control.
    // Es el momento perfecto para recargar y obtener el contenido más reciente.
    let refreshing;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      console.log(
        '[SW Register] El controlador ha cambiado. Recargando página para aplicar actualizaciones.'
      );
      window.location.reload();
      refreshing = true;
    });
  });
}
