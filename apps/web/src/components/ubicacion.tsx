'use client';

import { useState } from 'react';
import { IconoMapa, IconoUbicacion } from './ui';
import { MiniMapa } from './mini-mapa';

/**
 * Vista de calle del inmueble, con dos fuentes de condiciones muy distintas:
 *
 *   Street View  — cobertura casi total en España, pero sus términos NO
 *                  permiten guardar la imagen. Se pide en vivo a /api/streetview,
 *                  que hace de proxy para que la clave no salga en el HTML.
 *   Mapillary    — colaborativa y CC-BY-SA 4.0, así que se descarga y queda en
 *                  data/calle/. Cobertura irregular fuera de las ciudades.
 *
 * Se muestran las dos cuando existen: son fotos distintas, tomadas en fechas
 * distintas, y comparar ayuda más que elegir.
 *
 * Es cliente porque Street View puede no tener panorámica en ese punto: el
 * proxy responde 404 y el panel tiene que desaparecer solo.
 */

export interface FotoGuardada {
  ruta: string;
  imagenId: string | null;
  autor: string | null;
  licencia: string | null;
  distanciaM: number | null;
  capturadaEn: string | null;
}

export function Ubicacion({
  lat,
  lon,
  origenPunto,
  direccion,
  localidad,
  provincia,
  streetViewActivo,
  claveEmbed,
  fotoGuardada,
  hayFotosDelPortal,
}: {
  lat: number | null;
  lon: number | null;
  /** De dónde sale el punto: condiciona lo que se puede afirmar de él. */
  origenPunto: 'CATASTRO' | 'DIRECCION' | null;
  direccion: string | null;
  localidad: string | null;
  provincia: string | null;
  streetViewActivo: boolean;
  /**
   * Clave para el iframe de la Maps Embed API. Va al navegador por narices —
   * un iframe no se puede proxear— así que es una clave DISTINTA de la del
   * proxy y debe restringirse por referente en Google Cloud. Sin ella se cae
   * a la imagen estática, que sí pasa por el servidor.
   */
  claveEmbed: string | null;
  fotoGuardada: FotoGuardada | null;
  /**
   * Si el Portal ya publica fotos del inmueble, no se generan vistas: las
   * fotos reales mandan. Solo se rellena el hueco cuando no hay ninguna.
   */
  hayFotosDelPortal: boolean;
}) {
  const [svFallo, setSvFallo] = useState(false);
  const [svCargando, setSvCargando] = useState(true);

  const hayCoords = lat !== null && lon !== null;

  /* Sin referencia catastral no hay coordenadas, pero el Portal casi siempre da
     la dirección: 390 subastas están en ese caso. Google resuelve igual una
     dirección que un punto, así que se usa como plan B. */
  const señas = [direccion, localidad, provincia, 'España']
    .filter(Boolean)
    .join(', ');
  const haySeñas = Boolean(direccion) && señas.length >= 5;

  if (!hayCoords && !haySeñas) return null;

  const punto = hayCoords ? `${lat},${lon}` : señas;
  const consulta = hayCoords ? `lat=${lat}&lon=${lon}` : `dir=${encodeURIComponent(señas)}`;
  const paraGoogle = encodeURIComponent(punto);

  /* El visor navegable exige coordenadas: la Embed API no acepta direcciones en
     modo streetview. Las 370 subastas sin referencia catastral se quedan con la
     imagen estática, que sí las admite. */
  const svInteractivo = Boolean(claveEmbed) && hayCoords;
  const haySv = streetViewActivo && !svFallo;

  /* La ortofoto necesita coordenadas: el WMS del IGN va por caja geográfica, no
     por dirección. Sin referencia catastral no hay vistas generadas. */
  const mostrarVistas = !hayFotosDelPortal && hayCoords;

  return (
    <div className="space-y-4 rounded-lg border border-borde bg-superficie-alta p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-suave">
          Ubicación y vista de calle
        </p>
        <span className="font-mono text-[10px] text-tenue tabular">
          {hayCoords ? punto : 'por dirección'}
        </span>
      </div>

      {svInteractivo || haySv || fotoGuardada ? (
        <div
          className={`grid gap-3 ${(svInteractivo || haySv) && fotoGuardada ? 'sm:grid-cols-2' : ''}`}
        >
          {svInteractivo ? (
            /* Visor navegable empotrado. Además de ser lo cómodo, evita el
               visor en negro que a veces sale al abrir Google en otra pestaña
               (su WebGL arranca mal y solo se arregla recargando). */
            <figure className="space-y-1.5">
              <div className="overflow-hidden rounded-md border border-borde bg-superficie">
                <iframe
                  title={`Street View de ${direccion ?? punto}`}
                  src={`https://www.google.com/maps/embed/v1/streetview?key=${claveEmbed}&location=${lat},${lon}&fov=90`}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="block aspect-[16/10] w-full border-0"
                />
              </div>
              <figcaption className="text-[10px] leading-relaxed text-tenue">
                Google Street View · navegable · no se almacena nada
              </figcaption>
            </figure>
          ) : haySv ? (
            <figure className="space-y-1.5">
              <div className="relative overflow-hidden rounded-md border border-borde bg-superficie">
                {svCargando ? (
                  <div className="absolute inset-0 animate-pulse bg-superficie-alta" />
                ) : null}
                {/* Sin next/image: es un proxy dinámico, no un asset. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/streetview?${consulta}`}
                  alt={`Vista de calle de ${direccion ?? punto}`}
                  width={640}
                  height={400}
                  loading="lazy"
                  className="block h-auto w-full"
                  onLoad={() => setSvCargando(false)}
                  onError={() => {
                    setSvCargando(false);
                    setSvFallo(true);
                  }}
                />
              </div>
              <figcaption className="text-[10px] leading-relaxed text-tenue">
                Google Street View · imagen en vivo, no se almacena
                {hayCoords ? '' : ' · situada por la dirección, no por Catastro'}
              </figcaption>
            </figure>
          ) : null}

          {fotoGuardada ? (
            <figure className="space-y-1.5">
              <div className="overflow-hidden rounded-md border border-borde bg-superficie">
                {fotoGuardada.imagenId ? (
                  /* Visor navegable de Mapillary: se puede empotrar SIN clave
                     —no manda X-Frame-Options—, al contrario que el de Google,
                     cuyas URL antiguas responden SAMEORIGIN. */
                  <iframe
                    title={`Vista de calle de ${direccion ?? punto}`}
                    src={`https://www.mapillary.com/embed?image_key=${encodeURIComponent(fotoGuardada.imagenId)}&style=photo`}
                    loading="lazy"
                    allowFullScreen
                    /* Su visor pide WebXR al arrancar. Se le delega aquí, pero
                       el aviso de la consola persiste porque haría falta una
                       cabecera Permissions-Policy en el documento padre. Es
                       cosmético: el visor funciona igual y no compensa tocar
                       las cabeceras de toda la web por esto. */
                    allow="xr-spatial-tracking; fullscreen"
                    className="block aspect-[16/10] w-full border-0"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/calle/${fotoGuardada.ruta}`}
                    alt={`Foto de calle de ${direccion ?? punto}`}
                    loading="lazy"
                    className="block h-auto w-full"
                  />
                )}
              </div>
              <figcaption className="text-[10px] leading-relaxed text-tenue">
                {fotoGuardada.autor ? `© ${fotoGuardada.autor} · ` : ''}
                {fotoGuardada.licencia ?? 'Mapillary'}
                {fotoGuardada.distanciaM !== null
                  ? ` · a ${fotoGuardada.distanciaM.toFixed(0)} m`
                  : ''}
                {fotoGuardada.capturadaEn
                  ? ` · ${fotoGuardada.capturadaEn.slice(0, 7)}`
                  : ''}
              </figcaption>
            </figure>
          ) : null}
        </div>
      ) : (
        // Ojo con la redacción: sin clave NO sabemos si hay panorámica o no, y
        // decir "no hay" sería mentira — casi siempre la hay. Solo cuando la
        // clave está puesta y Google responde que no, se puede afirmar.
        <p className="rounded-md border border-dashed border-borde px-3 py-2.5 text-[11px] leading-relaxed text-tenue">
          {streetViewActivo ? (
            'Google no tiene panorámica de calle en este punto. Es lo normal en fincas rústicas y caminos sin asfaltar.'
          ) : (
            <>
              Esta app no tiene clave de Google, así que no puede traer la imagen
              aquí — <strong className="text-suave">no quiere decir que no exista</strong>.
              Ábrela con el botón de abajo. Para verla empotrada, añade{' '}
              <code className="font-mono">GOOGLE_MAPS_API_KEY</code> al fichero{' '}
              <code className="font-mono">.env</code>.
            </>
          )}
        </p>
      )}

      {/* Vistas generadas para las subastas sin fotos del Portal, que son la
          inmensa mayoría (440 de 479 con coordenadas). La ortofoto del IGN
          funciona siempre, también en rústico donde no hay vista de calle. */}
      {/* Mapa navegable empotrado, sin ninguna clave. Es lo que sustituye al
          "abrir en Google Maps": aquí se puede mover y hacer zoom sin salir. */}
      {hayCoords ? (
        <div className="space-y-1.5">
          <MiniMapa lat={lat} lon={lon} etiqueta={direccion ?? punto} />
          <p className="text-[10px] leading-relaxed text-tenue">
            © OpenStreetMap · mapa interactivo, sin clave ni cuenta
          </p>
        </div>
      ) : null}

      {mostrarVistas ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-suave">
            Vistas del entorno
          </p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Vista
              src={`/api/satelite?lat=${lat}&lon=${lon}&zoom=cerca`}
              pie="Aérea · parcela"
            />
            <Vista
              src={`/api/satelite?lat=${lat}&lon=${lon}&zoom=lejos`}
              pie="Aérea · entorno"
            />
            {streetViewActivo ? (
              <>
                <Vista
                  src={`/api/streetview?lat=${lat}&lon=${lon}`}
                  pie="Calle · hacia el inmueble"
                />
                <Vista
                  src={`/api/streetview?lat=${lat}&lon=${lon}&fov=120`}
                  pie="Calle · vista amplia"
                />
              </>
            ) : null}
          </div>
          <p className="text-[10px] leading-relaxed text-tenue">
            Ortofoto PNOA © Instituto Geográfico Nacional de España.
            {streetViewActivo ? ' Vistas de calle de Google, en vivo.' : ''}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Boton href={`https://www.google.com/maps/search/?api=1&query=${paraGoogle}`}>
          <IconoUbicacion className="size-3.5" />
          Google Maps
        </Boton>
        {/* `map_action=pano` exige viewpoint en coordenadas: con una dirección
            no vale, así que ahí se abre la búsqueda y se entra a pie de calle. */}
        {hayCoords ? (
          <Boton
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${paraGoogle}`}
          >
            <IconoMapa className="size-3.5" />
            Street View interactivo
          </Boton>
        ) : null}
      </div>

      <p className="text-[10px] leading-relaxed text-tenue">
        {origenPunto === 'CATASTRO'
          ? 'El punto es el centroide de la parcela según Catastro, no la puerta del inmueble. Comprueba la dirección antes de dar nada por hecho.'
          : origenPunto === 'DIRECCION'
            ? 'Sin referencia catastral: el punto está deducido de la dirección con el callejero del IGN. Suele acertar el portal, pero no es un dato oficial del inmueble.'
            : 'Sin referencia catastral: la vista sale de la dirección que publica el Portal, así que puede caer en otro portal o en otra calle del mismo nombre. Tómala como orientación.'}
      </p>
    </div>
  );
}

/** Miniatura de una vista generada. Se esconde sola si la fuente no responde. */
function Vista({ src, pie }: { src: string; pie: string }) {
  const [fallo, setFallo] = useState(false);
  const [cargando, setCargando] = useState(true);
  if (fallo) return null;

  return (
    <figure className="space-y-1">
      <div className="relative overflow-hidden rounded-md border border-borde bg-superficie">
        {cargando ? (
          <div className="absolute inset-0 animate-pulse bg-superficie-alta" />
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={pie}
          loading="lazy"
          className="block aspect-[3/2] w-full object-cover"
          onLoad={() => setCargando(false)}
          onError={() => {
            setCargando(false);
            setFallo(true);
          }}
        />
      </div>
      <figcaption className="text-[10px] leading-tight text-tenue">{pie}</figcaption>
    </figure>
  );
}

function Boton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-borde bg-superficie px-2.5 py-1.5 text-xs font-medium text-texto transition hover:border-borde-fuerte"
    >
      {children}
    </a>
  );
}
