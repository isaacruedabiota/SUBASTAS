'use client';

import { useEffect, useRef } from 'react';
import type { PuntoMapa } from '@subastas/db/consultas';

/**
 * Mapa con Leaflet directo (sin react-leaflet: una dependencia menos y control
 * total del ciclo de vida). Los tiles vienen de OpenStreetMap.
 *
 * Leaflet toca el DOM, así que se carga dinámicamente dentro de useEffect: en
 * el servidor no existe `window` y el import de nivel superior rompería el SSR.
 */
export function Mapa({ puntos }: { puntos: PuntoMapa[] }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (cancelado || !contenedor.current || mapaRef.current) return;

      const mapa = L.map(contenedor.current, {
        scrollWheelZoom: true,
        // Centro y zoom que encuadran la península, Baleares y Canarias.
        center: [40.0, -3.7],
        zoom: 6,
      });
      mapaRef.current = mapa;

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(mapa);

      const grupo: L.Marker[] = [];

      for (const p of puntos) {
        const eur = (c: number | null) =>
          c === null
            ? 'sin importe'
            : new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              }).format(c / 100);

        const descuento =
          p.tasacion && p.valorSubasta && p.tasacion > 0
            ? Math.round((1 - p.valorSubasta / p.tasacion) * 100)
            : null;

        // Círculo en vez de pin: escala mejor con muchos puntos y el color
        // codifica el descuento, que es la lectura rápida que interesa.
        const color =
          descuento !== null && descuento >= 30
            ? '#059669'
            : descuento !== null && descuento >= 10
              ? '#65a30d'
              : '#64748b';

        const marcador = L.circleMarker([p.lat, p.lon], {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        });

        marcador.bindPopup(
          `<div style="font: 13px/1.45 system-ui, sans-serif; min-width: 190px">
             <strong>${escapar(p.direccion ?? 'Sin dirección')}</strong><br>
             <span style="color:#64748b">${escapar(
               [p.localidad, p.provincia].filter(Boolean).join(', '),
             )}</span><br>
             <span style="font-size:15px;font-weight:600">${eur(p.valorSubasta)}</span>
             ${
               descuento !== null && descuento > 0
                 ? `<span style="color:#059669"> · −${descuento}%</span>`
                 : ''
             }
             ${p.superficie ? `<br><span style="color:#64748b">${p.superficie} m²</span>` : ''}
             <br><a href="/subasta/${encodeURIComponent(p.subastaId)}"
                    style="color:#1d4ed8">Ver ficha →</a>
           </div>`,
        );

        marcador.addTo(mapa);
        grupo.push(marcador as unknown as L.Marker);
      }

      // Encuadrar sobre lo que hay, salvo que no haya nada.
      if (grupo.length > 0) {
        const bounds = L.latLngBounds(puntos.map((p) => [p.lat, p.lon]));
        mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    })();

    return () => {
      cancelado = true;
      const m = mapaRef.current as { remove?: () => void } | null;
      m?.remove?.();
      mapaRef.current = null;
    };
  }, [puntos]);

  return (
    <div
      ref={contenedor}
      className="h-[70vh] min-h-96 w-full overflow-hidden rounded-xl border border-borde bg-superficie-alta"
    />
  );
}

/** El popup se construye con HTML: los datos vienen de fuentes externas. */
function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
