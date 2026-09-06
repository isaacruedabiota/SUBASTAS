'use client';

import { useState } from 'react';

/**
 * Miniatura del listado, con pase de imágenes sin entrar en la ficha.
 *
 * Tres capas, de mejor a peor:
 *   1. Fotos del Portal ya descargadas — las reales del inmueble, pero solo
 *      las tiene 1 de cada 20.
 *   2. Ortofoto del IGN (parcela y entorno) — cualquiera con coordenadas.
 *   3. Marcador de posición dibujado — el resto, que son mayoría.
 *
 * Las aéreas se piden al servidor solo cuando la imagen entra en pantalla
 * (`loading="lazy"`) y solo la que se está viendo: el listado no dispara 60
 * peticiones al IGN de golpe.
 */

export function Carrusel({
  fotos,
  lat,
  lon,
  alt,
}: {
  fotos: string[];
  lat: number | null;
  lon: number | null;
  alt: string;
}) {
  const laminas: Array<{ src: string; etiqueta: string }> = [
    ...fotos.map((f, i) => ({
      src: `/api/foto/${f}`,
      etiqueta: `Foto ${i + 1} del Portal`,
    })),
    ...(lat !== null && lon !== null
      ? [
          { src: `/api/satelite?lat=${lat}&lon=${lon}&zoom=cerca`, etiqueta: 'Vista aérea' },
          { src: `/api/satelite?lat=${lat}&lon=${lon}&zoom=lejos`, etiqueta: 'Entorno' },
        ]
      : []),
  ];

  const [indice, setIndice] = useState(0);
  const [rotas, setRotas] = useState<Set<number>>(new Set());

  const utiles = laminas.filter((_, i) => !rotas.has(i));

  if (utiles.length === 0) return <SinImagen />;

  const actual = Math.min(indice, utiles.length - 1);
  const lamina = utiles[actual]!;

  /* El carrusel vive dentro de una fila que es un enlace: sin frenar el evento,
     pasar de imagen navegaría a la ficha. */
  const mover = (e: React.MouseEvent, paso: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIndice((n) => (n + paso + utiles.length) % utiles.length);
  };

  return (
    <div className="group/car relative h-28 w-full shrink-0 overflow-hidden rounded-lg border border-borde bg-superficie-alta sm:h-20 sm:w-28">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={lamina.src}
        alt={`${lamina.etiqueta} · ${alt}`}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() =>
          setRotas((s) => {
            const n = new Set(s);
            n.add(laminas.indexOf(lamina));
            return n;
          })
        }
      />

      {utiles.length > 1 ? (
        <>
          <Flecha lado="izq" onClick={(e) => mover(e, -1)} />
          <Flecha lado="der" onClick={(e) => mover(e, 1)} />

          {/* Puntos de posición. En una miniatura de 112px, más de 6 no caben. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-1">
            {utiles.slice(0, 6).map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === actual ? 'w-2.5 bg-white' : 'w-1 bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Flecha({
  lado,
  onClick,
}: {
  lado: 'izq' | 'der';
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === 'izq' ? 'Imagen anterior' : 'Imagen siguiente'}
      className={`absolute top-1/2 z-10 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white opacity-0 transition group-hover/car:opacity-100 focus:opacity-100 ${
        lado === 'izq' ? 'left-1' : 'right-1'
      }`}
    >
      <svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor" aria-hidden>
        <path
          d={
            lado === 'izq'
              ? 'M12.5 15.5 7 10l5.5-5.5 1.4 1.4L9.8 10l4.1 4.1z'
              : 'M7.5 4.5 13 10l-5.5 5.5-1.4-1.4L10.2 10 6.1 5.9z'
          }
        />
      </svg>
    </button>
  );
}

/** Sin ninguna imagen disponible: la mayoría del catálogo. */
function SinImagen() {
  return (
    <div
      className="grid h-28 w-full shrink-0 place-items-center rounded-lg border border-dashed border-borde bg-superficie-alta sm:h-20 sm:w-28"
      title="Sin imagen: la ficha no tiene fotos ni referencia catastral"
    >
      <svg viewBox="0 0 24 24" className="size-7 text-tenue/45" fill="currentColor" aria-hidden>
        <path d="M12 3 3 9.5V21h6v-6h6v6h6V9.5L12 3Zm0 2.5 7 5V19h-2v-6H7v6H5v-8.5l7-5Z" />
      </svg>
    </div>
  );
}
