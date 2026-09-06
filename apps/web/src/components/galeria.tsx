'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { descargarFotos } from '@/app/acciones';
import { Tarjeta, TituloSeccion, IconoCasa, IconoDoc } from './ui';

/**
 * Fotografías y documentos que el Portal publica de la subasta.
 *
 * Es el hallazgo tardío del proyecto: la ficha del Portal, además de las tablas
 * de datos, a veces trae fotos REALES del inmueble ("Vista fachada") y una
 * lista de PDF con la certificación de cargas o la nota simple.
 *
 * Solo el 5% de las subastas traen fotos, pero cuando las hay son la única
 * imagen del bien que existe en una fuente oficial. Los documentos son mucho
 * más frecuentes y no se descargan: se enlazan al Portal.
 */

export interface Adjunto {
  docId: string;
  tipo: string;
  titulo: string;
  ruta: string | null;
}

/** Indicador de espera. Las fotos tardan porque se piden al Portal una a una. */
function Girando({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-20"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-dato"
      />
    </svg>
  );
}

export function Galeria({
  identificador,
  adjuntos,
}: {
  identificador: string;
  adjuntos: Adjunto[];
}) {
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bajando, empezar] = useTransition();
  const router = useRouter();
  const yaPedido = useRef(false);

  const fotos = adjuntos.filter((a) => a.tipo === 'FOTO');
  const documentos = adjuntos.filter((a) => a.tipo === 'DOCUMENTO');
  const descargadas = fotos.filter((f) => f.ruta);
  const faltan = fotos.length - descargadas.length;

  /**
   * Al abrir la ficha se bajan las fotos que falten. Es el mismo modelo bajo
   * demanda que la lectura de la ficha: el usuario está mirando ESTA subasta.
   *
   * El `useRef` evita que el efecto se dispare dos veces (React lo monta dos
   * veces en desarrollo con StrictMode) y que se repita tras el refresh, que
   * vuelve a renderizar el componente.
   */
  useEffect(() => {
    if (faltan <= 0 || yaPedido.current) return;
    yaPedido.current = true;

    empezar(async () => {
      const r = await descargarFotos(identificador);
      if (!r.ok) setError(r.error);
      else if (r.descargadas > 0) router.refresh();
      else if (r.fallos > 0) setError('El Portal no devolvió las imágenes.');
    });
  }, [faltan, identificador, router]);

  if (fotos.length === 0 && documentos.length === 0) return null;

  const urlPortal = (docId: string) =>
    `https://subastas.boe.es/verDocumento.php?idSub=${encodeURIComponent(
      identificador,
    )}&idDoc=${encodeURIComponent(docId)}`;

  return (
    <Tarjeta>
      <TituloSeccion
        icono={<IconoCasa className="size-4 text-tenue" />}
        extra={
          fotos.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-tenue tabular">
              {bajando ? <Girando className="size-3" /> : null}
              {descargadas.length} de {fotos.length}
            </span>
          ) : null
        }
      >
        Fotografías y documentos del Portal
      </TituloSeccion>

      <div className="space-y-5 p-5">
        {fotos.length > 0 ? (
          descargadas.length > 0 || bajando ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {/* Huecos con pulso mientras bajan: uno por foto que falta, para
                  que la rejilla no dé un salto cuando lleguen. */}
              {bajando
                ? Array.from({ length: faltan }, (_, i) => (
                    <li key={`cargando-${i}`}>
                      <div className="overflow-hidden rounded-lg border border-borde bg-superficie-alta">
                        <div className="flex aspect-[4/3] items-center justify-center bg-superficie-alta">
                          <Girando />
                        </div>
                        <span className="block px-2.5 py-2 text-[11px] text-tenue">
                          Descargando…
                        </span>
                      </div>
                    </li>
                  ))
                : null}
              {descargadas.map((f) => (
                <li key={f.docId}>
                  <button
                    type="button"
                    onClick={() => setAmpliada(f.ruta)}
                    className="group block w-full overflow-hidden rounded-lg border border-borde bg-superficie-alta text-left transition hover:border-borde-fuerte"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/foto/${f.ruta}`}
                      alt={f.titulo}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover transition group-hover:opacity-90"
                    />
                    <span className="block px-2.5 py-2 text-[11px] leading-tight text-suave">
                      {f.titulo}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            /* Aquí solo se llega si la descarga automática falló: si va bien,
               arriba se pintan los huecos girando y luego las fotos. */
            <p className="rounded-lg border border-dashed border-borde px-4 py-3 text-xs leading-relaxed text-tenue">
              {error ?? 'No se pudieron traer las fotografías del Portal.'}{' '}
              Puedes reintentarlo con <code className="font-mono">npm run fotos</code>.
            </p>
          )
        ) : null}

        {documentos.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-suave">
              Documentos ({documentos.length})
            </p>
            <ul className="space-y-1.5">
              {documentos.map((d) => (
                <li key={d.docId}>
                  <a
                    href={urlPortal(d.docId)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs text-texto transition hover:bg-superficie-alta"
                  >
                    <IconoDoc className="mt-0.5 size-3.5 shrink-0 text-tenue" />
                    <span className="leading-snug">{d.titulo}</span>
                  </a>
                </li>
              ))}
            </ul>
            {/* La certificación de cargas es el documento que más caro sale
                ignorar: es justo lo que la ficha suele dejar en "no consta". */}
            {documentos.some((d) => /carga/i.test(d.titulo)) ? (
              <p className="text-[11px] leading-relaxed text-tenue">
                Hay una <strong className="text-suave">certificación de cargas</strong>:
                es el documento que aclara lo que la ficha deja en «no consta».
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {ampliada ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fotografía ampliada"
          onClick={() => setAmpliada(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/foto/${ampliada}`}
            alt="Fotografía del inmueble"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={() => setAmpliada(null)}
            className="absolute right-4 top-4 rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-black"
          >
            Cerrar
          </button>
        </div>
      ) : null}
    </Tarjeta>
  );
}
