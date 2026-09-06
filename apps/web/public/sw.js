/*
 * Service worker. Solo hace UNA cosa: recibir notificaciones push.
 *
 * No cachea nada a propósito. Un service worker que guarda respuestas sirve para
 * funcionar sin red, y aquí los datos salen de un SQLite que está en el mismo
 * ordenador que el servidor: sin red no hay web que valga, y una caché solo
 * conseguiría enseñar importes viejos de subastas vivas. Peor que nada.
 *
 * ⚠️ Esto solo arranca en contexto seguro: HTTPS, o `localhost`. Por
 * `http://192.168.1.x` el navegador ni lo registra, y sin service worker no hay
 * push. Es el motivo de servir la web por HTTPS si se quieren avisos en el móvil.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let aviso;
  try {
    aviso = event.data.json();
  } catch {
    aviso = { titulo: 'Subastas', cuerpo: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(aviso.titulo || 'Subastas', {
      body: aviso.cuerpo || '',
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      /* Con la misma etiqueta, un aviso nuevo sustituye al anterior en vez de
         apilarse: si llegan tres tandas seguidas no se acumulan tres avisos. */
      tag: aviso.etiqueta || 'subastas',
      renotify: true,
      data: { url: aviso.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = event.notification.data?.url || '/';

  /* Si ya hay una pestaña de la app abierta se reutiliza, en vez de abrir otra
     más cada vez que llega un aviso. */
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abiertas) => {
      for (const cliente of abiertas) {
        if (cliente.url === destino && 'focus' in cliente) return cliente.focus();
      }
      for (const cliente of abiertas) {
        if ('navigate' in cliente) return cliente.navigate(destino).then((c) => c?.focus());
      }
      return self.clients.openWindow(destino);
    }),
  );
});
