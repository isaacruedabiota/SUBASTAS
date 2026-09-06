'use client';

import { useEffect, useRef } from 'react';

/**
 * Mapa interactivo de un solo punto, empotrado en la ficha.
 *
 * Leaflet + OpenStreetMap: **sin clave, sin cuenta y sin coste**. Es la
 * alternativa al mapa de Google, que solo se puede empotrar con la Maps Embed
 * API — sus URL antiguas responden `X-Frame-Options: SAMEORIGIN`, así que no
 * hay forma de meterlas en un iframe sin clave.
 *
 * Mismo planteamiento que el mapa grande: Leaflet directo, cargado dentro del
 * efecto porque toca el DOM y en el servidor no existe `window`.
 */
export function MiniMapa({
  lat,
  lon,
  etiqueta,
}: {
  lat: number;
  lon: number;
  etiqueta: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (cancelado || !contenedor.current || mapaRef.current) return;

      const mapa = L.map(contenedor.current, {
        center: [lat, lon],
        zoom: 17,
        scrollWheelZoom: false, // no secuestra el scroll de la ficha
      });
      mapaRef.current = mapa;

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(mapa);

      L.circleMarker([lat, lon], {
        radius: 9,
        weight: 3,
        color: '#2563eb',
        fillColor: '#2563eb',
        fillOpacity: 0.35,
      })
        .addTo(mapa)
        .bindPopup(etiqueta);
    })();

    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, [lat, lon, etiqueta]);

  return (
    <div
      ref={contenedor}
      className="aspect-[16/10] w-full overflow-hidden rounded-md border border-borde bg-superficie"
      role="img"
      aria-label={`Mapa de ${etiqueta}`}
    />
  );
}
