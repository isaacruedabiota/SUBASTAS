import type { MetadataRoute } from 'next';

/**
 * Manifiesto de aplicación web.
 *
 * Sirve para instalar la web en la pantalla de inicio del móvil. No es un
 * capricho estético: **en iOS las notificaciones push solo llegan si la web está
 * instalada**, porque Safari no las admite desde una pestaña normal. En Android
 * funcionan igual instalada que no, pero instalada se abre sin barra del
 * navegador y se comporta como una aplicación.
 *
 * Para que el navegador ofrezca instalarla hacen falta este manifiesto y HTTPS.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Subastas — agregador personal',
    short_name: 'Subastas',
    description:
      'Consulta de subastas públicas españolas: estado, histórico y datos del inmueble.',
    start_url: '/',
    display: 'standalone',
    /* Los mismos valores que `--fondo` y `--superficie` del tema oscuro: la
       pantalla de arranque y la barra de estado no deben dar un fogonazo blanco
       antes de que cargue la web. */
    background_color: '#0a0c10',
    theme_color: '#12161c',
    lang: 'es',
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
      /* `maskable` deja que Android recorte el icono a la forma que use el
         lanzador. Sin una versión así, el sistema mete el icono cuadrado dentro
         de un círculo blanco y queda una pastilla fea. */
      {
        src: '/icono-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
