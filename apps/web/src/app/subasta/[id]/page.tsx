import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  anuncioDeSubasta,
  obtenerSubasta,
  type BienDetalle,
  type SubastaDetalle,
} from '@subastas/db/consultas';
import {
  Aviso,
  BarraDescuento,
  Dato,
  Estado,
  IconoCasa,
  IconoDoc,
  IconoEuro,
  IconoMapa,
  IconoReloj,
  IconoUbicacion,
  Tarjeta,
  TituloSeccion,
} from '@/components/ui';
import { BotonConsultar } from '@/components/boton-consultar';
import { Ubicacion } from '@/components/ubicacion';
import { Galeria } from '@/components/galeria';
import { CompletarFicha } from '@/components/completar-ficha';
import {
  descuento,
  diasRestantes,
  eurExacto,
  fecha,
  metros,
  oNoConsta,
} from '@/lib/formato';

export const dynamic = 'force-dynamic';

/** En Next.js 16 `params` es una Promise. */
type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  const subasta = obtenerSubasta(id);

  if (!subasta) {
    const anuncio = anuncioDeSubasta(id);
    if (!anuncio) notFound();
    return <SinFicha id={id} anuncio={anuncio} />;
  }

  return <ConFicha subasta={subasta} />;
}

/* ------------------------------------------------------------------ */

/**
 * Estado de puja del conjunto, a partir de la última lectura de cada lote.
 *
 * Con varios lotes el Portal no da una cifra de la subasta: da la de cada lote
 * por separado. Se suman, igual que los importes de salida, y se dice cuántos
 * lotes componen esa suma — porque una suma de 2 de 10 lotes no es la puja por
 * el conjunto y no debe leerse como tal.
 */
function agregarPujas(pujas: SubastaDetalle['pujas']): {
  importe: number | null;
  situacion: string | null;
  lotes: number;
  lotesConImporte: number;
} {
  const conImporte = pujas.filter((p) => p.pujaMaxima !== null);
  const situaciones = new Set(pujas.map((p) => p.situacion));

  return {
    importe:
      conImporte.length > 0
        ? conImporte.reduce((t, p) => t + (p.pujaMaxima ?? 0), 0)
        : null,
    // Basta que un lote tenga pujas para que la subasta las tenga.
    situacion:
      (['CONOCIDA', 'OCULTA', 'SECRETA', 'SIN_PUJAS'] as const).find((s) =>
        situaciones.has(s),
      ) ?? null,
    lotes: pujas.length,
    lotesConImporte: conImporte.length,
  };
}

function notaPuja(p: ReturnType<typeof agregarPujas>): string | undefined {
  if (p.lotes > 1 && p.lotesConImporte > 0 && p.lotesConImporte < p.lotes) {
    return `Suma de ${p.lotesConImporte} de ${p.lotes} lotes; del resto no consta importe`;
  }
  if (p.lotes > 1 && p.lotesConImporte === p.lotes) {
    return `Suma de los ${p.lotes} lotes`;
  }
  if (p.importe === null && p.situacion === 'OCULTA') {
    return 'El importe solo se ve con sesión iniciada en el Portal';
  }
  if (p.importe === null && p.situacion === 'SECRETA') {
    return 'Esta subasta no publica su puja máxima';
  }
  return undefined;
}

function ConFicha({ subasta: s }: { subasta: SubastaDetalle }) {
  const dias = diasRestantes(s.fechaConclusion);
  const dto = descuento(s.tasacion, s.valorSubasta);
  const puja = agregarPujas(s.pujas);
  const pujaActual = puja.importe;
  const principal = s.bienes[0];

  return (
    <div className="space-y-5">
      <Volver />

      {/* ---------------- Cabecera ---------------- */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Estado estado={s.estado} />
          {dias !== null && dias >= 0 && s.estado === 'CELEBRANDOSE' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-riesgo-borde bg-riesgo-fondo px-2.5 py-1 text-[11px] font-medium text-riesgo">
              <IconoReloj className="size-3.5" />
              {dias === 0 ? 'Termina hoy' : `Quedan ${dias} día${dias === 1 ? '' : 's'}`}
            </span>
          ) : null}
          <span className="font-mono text-[11px] text-tenue">{s.identificador}</span>
        </div>

        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-texto">
          {principal?.direccion ?? s.tipo ?? s.identificador}
        </h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-suave">
          {principal ? (
            <span className="inline-flex items-center gap-1.5">
              <IconoUbicacion className="size-4 text-tenue" />
              {[principal.codigoPostal, principal.localidad, principal.provincia]
                .filter(Boolean)
                .join(', ') || 'Localidad no consta'}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <IconoDoc className="size-4 text-tenue" />
            {s.autoridadGestora ?? 'Autoridad no consta'}
          </span>
        </div>
      </header>

      {/* Leída solo en lo básico: se piden ahora las pestañas que faltan. */}
      {s.lectura === 'BASICA' ? <CompletarFicha identificador={s.identificador} /> : null}

      {s.estadoTexto ? (
        <p className="rounded-lg border border-borde bg-superficie-alta px-4 py-3 text-xs leading-relaxed text-suave">
          {s.estadoTexto}
        </p>
      ) : null}

      {/* ---------------- Economía ---------------- */}
      <Tarjeta>
        <TituloSeccion icono={<IconoEuro className="size-4 text-tenue" />}>
          Economía de la subasta
        </TituloSeccion>

        <div className="space-y-5 p-5">
          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
              {/* El % de descuento no se repite aquí: lo dice la barra de abajo
                  con más contexto. Aquí basta el color. */}
              <Dato
                etiqueta="Valor de salida"
                valor={eurExacto(s.valorSubasta)}
                tamano="grande"
                tono={dto !== null && dto >= 1 ? 'oportunidad' : 'normal'}
              />
              {/* Una tasación de 0,00 € es "no informada", no un inmueble que
                  no vale nada. Mostrar el cero decía justo lo contrario. */}
              <Dato
                etiqueta="Tasación"
                valor={s.tasacion ? eurExacto(s.tasacion) : 'No consta'}
                tamano="grande"
                tono={s.tasacion ? 'normal' : 'tenue'}
              />
              {/* ⚠️ A un anónimo el Portal NO le da el importe mientras la
                  subasta está en curso: dice si hay pujas, pero la cifra exige
                  sesión. Decir "Sin pujas" sin que él lo diga es afirmar de más.
                  Y con lotes la cifra es la SUMA de los lotes leídos. */}
              <Dato
                etiqueta={puja.lotes > 1 ? 'Puja máxima (todos los lotes)' : 'Puja máxima'}
                valor={
                  pujaActual !== null
                    ? eurExacto(pujaActual)
                    : puja.situacion === 'OCULTA'
                      ? 'Hay pujas'
                      : puja.situacion === 'SECRETA'
                        ? 'Secreta'
                        : puja.situacion === 'SIN_PUJAS'
                          ? 'Sin pujas'
                          : 'No consta'
                }
                nota={notaPuja(puja)}
                tamano="grande"
                tono={
                  pujaActual !== null
                    ? 'normal'
                    : puja.situacion === 'OCULTA'
                      ? 'dato'
                      : 'tenue'
                }
              />
            </dl>
          </div>

          <BarraDescuento
            tasacion={s.tasacion}
            valorSubasta={s.valorSubasta}
            pujaMaxima={pujaActual}
          />

          <dl className="grid grid-cols-2 gap-5 border-t border-borde pt-5 sm:grid-cols-4">
            <Dato
              etiqueta="Depósito"
              valor={eurExacto(s.importeDeposito)}
              nota="Para poder pujar"
            />
            <Dato etiqueta="Tramo entre pujas" valor={eurExacto(s.tramosEntrePujas)} />
            {/* ⚠️ «Sin puja mínima» es una AFIRMACIÓN del Portal, no un hueco:
                significa que se admite cualquier puja. Mostrarlo como «No
                consta» —que es lo que hacía en 983 de 1.630 fichas— decía lo
                contrario justo en el dato que responde "¿cuánto debo pujar?". */}
            <Dato
              etiqueta="Puja mínima"
              valor={
                s.pujaMinima !== null
                  ? eurExacto(s.pujaMinima)
                  : s.pujaMinimaSituacion === 'SIN_MINIMA'
                    ? 'Sin mínimo'
                    : s.pujaMinimaSituacion === 'POR_LOTE'
                      ? 'Según el lote'
                      : 'No consta'
              }
              nota={
                s.pujaMinimaSituacion === 'SIN_MINIMA'
                  ? 'El Portal no fija suelo: se admite cualquier puja'
                  : s.pujaMinimaSituacion === 'POR_LOTE'
                    ? 'Cada lote tiene la suya'
                    : undefined
              }
              tono={
                s.pujaMinima !== null || s.pujaMinimaSituacion === 'SIN_MINIMA'
                  ? 'normal'
                  : 'tenue'
              }
            />
            <Dato
              etiqueta="Cantidad reclamada"
              valor={eurExacto(s.cantidadReclamada)}
            />
          </dl>

          <dl className="grid grid-cols-2 gap-5 border-t border-borde pt-5">
            <Dato etiqueta="Inicio" valor={fecha(s.fechaInicio)} />
            <Dato etiqueta="Conclusión" valor={fecha(s.fechaConclusion)} />
          </dl>
        </div>
      </Tarjeta>

      {/* ---------------- Fotos y documentos del Portal ---------------- */}
      <Galeria identificador={s.identificador} adjuntos={s.adjuntos} />

      {/* ---------------- Bienes ---------------- */}
      {/* El nº de lote NO numera los bienes: un lote puede traer 24. Se numeran
          por posición y el lote solo se rotula si la subasta tiene más de uno. */}
      {/* Varios bienes pueden compartir referencia catastral —y por tanto punto—
          cuando la subasta trocea un mismo inmueble en lotes. Sin esto, la
          ficha repetía la ortofoto y la vista de calle una vez por bien. */}
      {(() => {
        const vistos = new Set<string>();
        const primeroConPunto = s.bienes.map((b) => {
          const clave = b.referenciaCatastral ?? (b.lat !== null ? `${b.lat},${b.lon}` : null);
          if (clave === null) return b.lat !== null;
          if (vistos.has(clave)) return false;
          vistos.add(clave);
          return true;
        });
        return s.bienes.map((b, i) => (
        <BienFicha
          key={b.bienId ?? `lote-${b.lote}`}
          bien={b}
          indice={i + 1}
          total={s.bienes.length}
          mostrarUbicacion={primeroConPunto[i]!}
          mostrarLote={new Set(s.bienes.map((x) => x.lote)).size > 1}
          streetViewActivo={Boolean(process.env.GOOGLE_MAPS_API_KEY)}
          /* Clave del iframe: viaja al navegador, así que es otra distinta y
             restringida por referente. Sin ella queda la imagen estática. */
          claveEmbed={process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ?? null}
          /* Con fotos reales del Portal no se generan vistas: mandan aquellas. */
          hayFotosDelPortal={s.adjuntos.some((a) => a.tipo === 'FOTO')}
        />
        ));
      })()}

      {/* ---------------- Procedencia ---------------- */}
      <Tarjeta>
        <TituloSeccion icono={<IconoDoc className="size-4 text-tenue" />}>
          Procedencia de los datos
        </TituloSeccion>
        <ul className="space-y-2.5 p-5 text-xs text-suave">
          {s.idAnuncioBoe ? (
            <li className="flex flex-wrap items-center gap-1.5">
              <Fuente>BOE</Fuente>
              <a
                href={`https://www.boe.es/diario_boe/txt.php?id=${s.idAnuncioBoe}`}
                target="_blank"
                rel="noreferrer"
                className="text-dato hover:underline"
              >
                {s.idAnuncioBoe}
              </a>
              <span className="text-tenue">· anuncio oficial que la identifica</span>
            </li>
          ) : null}
          {s.urlPortal ? (
            <li className="flex flex-wrap items-center gap-1.5">
              <Fuente>Portal</Fuente>
              <a
                href={s.urlPortal}
                target="_blank"
                rel="noreferrer"
                className="text-dato hover:underline"
              >
                Ficha oficial
              </a>
              {s.portalLeidoEn ? (
                <span className="text-tenue">· leída el {fecha(s.portalLeidoEn)}</span>
              ) : null}
            </li>
          ) : null}
          {s.autoridadTelefono || s.autoridadCorreo ? (
            <li className="flex flex-wrap items-center gap-1.5">
              <Fuente>Contacto</Fuente>
              <span>{s.autoridadTelefono ?? ''}</span>
              {s.autoridadCorreo ? (
                <a
                  href={`mailto:${s.autoridadCorreo}`}
                  className="text-dato hover:underline"
                >
                  {s.autoridadCorreo}
                </a>
              ) : null}
            </li>
          ) : null}
        </ul>
      </Tarjeta>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BienFicha({
  bien: b,
  indice,
  total,
  mostrarLote,
  mostrarUbicacion,
  streetViewActivo,
  claveEmbed,
  hayFotosDelPortal,
}: {
  bien: BienDetalle;
  indice: number;
  total: number;
  mostrarLote: boolean;
  /** Falso en los bienes que repiten el punto de uno anterior. */
  mostrarUbicacion: boolean;
  streetViewActivo: boolean;
  claveEmbed: string | null;
  hayFotosDelPortal: boolean;
}) {
  const cat = b.catastro;

  const superficie = cat
    ? cat.superficieConstruida && cat.superficieConstruida > 0
      ? { valor: cat.superficieConstruida, etiqueta: 'Superficie construida' }
      : cat.superficieSuelo && cat.superficieSuelo > 0
        ? { valor: cat.superficieSuelo, etiqueta: 'Superficie de suelo' }
        : null
    : null;

  const sinInformar = b.cargas === null || b.situacionPosesoria === null;

  return (
    <Tarjeta>
      <TituloSeccion
        icono={<IconoCasa className="size-4 text-tenue" />}
        extra={
          b.viviendaHabitual === 1 ? (
            <span className="rounded-full border border-riesgo-borde bg-riesgo-fondo px-2 py-0.5 text-[11px] font-medium text-riesgo">
              Vivienda habitual
            </span>
          ) : null
        }
      >
        {total > 1
          ? `Bien ${indice} de ${total}${mostrarLote ? ` · Lote ${b.lote}` : ''} · ${b.tipoBien}`
          : 'El inmueble'}
      </TituloSeccion>

      <div className="space-y-5 p-5">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Dato etiqueta="Dirección" valor={oNoConsta(b.direccion)} />
          <Dato
            etiqueta="Localidad"
            valor={
              [b.codigoPostal, b.localidad, b.provincia].filter(Boolean).join(' · ') ||
              'No consta'
            }
          />
        </dl>

        {/* Riesgo: lo que decide si la subasta interesa de verdad */}
        <div className="space-y-3 rounded-lg border border-borde bg-superficie-alta p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-suave">
            Situación jurídica
          </p>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Dato
              etiqueta="Cargas"
              valor={oNoConsta(b.cargas)}
              tono={b.cargasImporte && b.cargasImporte > 0 ? 'riesgo' : 'normal'}
              nota={
                b.cargasImporte && b.cargasImporte > 0
                  ? 'Se suman al precio final'
                  : undefined
              }
            />
            <Dato
              etiqueta="Situación posesoria"
              valor={oNoConsta(b.situacionPosesoria)}
            />
            <Dato etiqueta="Título jurídico" valor={oNoConsta(b.tituloJuridico)} />
          </dl>

          {sinInformar ? (
            <Aviso>
              <strong className="font-semibold">«No consta»</strong> significa que la
              autoridad gestora no informó ese dato — no que el bien esté libre de
              cargas ni desocupado. Compruébalo en el registro antes de pujar.
            </Aviso>
          ) : null}
        </div>

        {/* Catastro */}
        {cat ? (
          <div className="space-y-4 rounded-lg border border-dato-borde bg-dato-fondo p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-dato">
                Datos de Catastro
              </p>
              {b.referenciaCatastral ? (
                <span className="font-mono text-[10px] text-dato/70">
                  {b.referenciaCatastral}
                </span>
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {superficie ? (
                <Dato
                  etiqueta={superficie.etiqueta}
                  valor={metros(superficie.valor)}
                  tamano="grande"
                  tono="dato"
                />
              ) : null}
              <Dato
                etiqueta="Año"
                valor={cat.anioConstruccion ? String(cat.anioConstruccion) : '—'}
                tamano="grande"
                tono="dato"
              />
              <Dato etiqueta="Uso" valor={oNoConsta(cat.usoPrincipal)} />
              <Dato etiqueta="Clase" valor={oNoConsta(cat.clase)} />
            </dl>

            {cat.tipoFinca ? (
              <p className="text-xs text-suave">{cat.tipoFinca}</p>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              {cat.urlPlano ? (
                <Enlace href={cat.urlPlano}>
                  <IconoMapa className="size-3.5" />
                  Plano catastral
                </Enlace>
              ) : null}
              {cat.lat && cat.lon ? (
                <Enlace
                  href={`https://www.openstreetmap.org/?mlat=${cat.lat}&mlon=${cat.lon}#map=18/${cat.lat}/${cat.lon}`}
                >
                  <IconoUbicacion className="size-3.5" />
                  Ver en el mapa
                </Enlace>
              ) : null}
            </div>
          </div>
        ) : b.referenciaCatastral ? (
          <Aviso tono="dato">
            Referencia catastral{' '}
            <code className="font-mono">{b.referenciaCatastral}</code> aún sin
            consultar. Ejecuta <code className="font-mono">npm run enriquecer</code>.
          </Aviso>
        ) : (
          <p className="rounded-lg border border-dashed border-borde px-4 py-3 text-xs leading-relaxed text-tenue">
            El Portal no publica referencia catastral para este bien, así que no puede
            enriquecerse con superficie, antigüedad ni coordenadas. Es lo habitual en
            las subastas judiciales.
          </p>
        )}

        {/* Vista de calle. Con coordenadas de Catastro si las hay y, si no, por
            la dirección del Portal — que la tienen 780 de 859 fichas frente a
            las 414 con coordenadas. El componente decide y se oculta solo. */}
        {mostrarUbicacion ? (
        <Ubicacion
          lat={b.lat}
          lon={b.lon}
          origenPunto={b.origenPunto}
          direccion={b.direccion}
          localidad={b.localidad}
          provincia={b.provincia}
          streetViewActivo={streetViewActivo}
          claveEmbed={claveEmbed}
          fotoGuardada={b.fotoCalle}
          hayFotosDelPortal={hayFotosDelPortal}
        />
        ) : null}

        {/* Textos largos, plegados */}
        {b.descripcion ? (
          <Desplegable titulo="Descripción registral completa">
            {b.descripcion}
          </Desplegable>
        ) : null}
        {b.informacionAdicional ? (
          <Desplegable titulo="Información adicional (hipotecas, embargos)">
            {b.informacionAdicional}
          </Desplegable>
        ) : null}
        {b.inscripcionRegistral ? (
          <Desplegable titulo="Inscripción registral">
            {b.inscripcionRegistral}
          </Desplegable>
        ) : null}
      </div>
    </Tarjeta>
  );
}

/* ------------------------------------------------------------------ */

function SinFicha({
  id,
  anuncio,
}: {
  id: string;
  anuncio: { identificador: string; titulo: string; texto: string; urlHtml: string | null };
}) {
  return (
    <div className="space-y-5">
      <Volver />

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Estado estado={null} />
          <span className="font-mono text-[11px] text-tenue">{id}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-texto">
          {anuncio.titulo}
        </h1>
      </header>

      <Tarjeta>
        <TituloSeccion icono={<IconoDoc className="size-4 text-tenue" />}>
          Edicto publicado en el BOE
        </TituloSeccion>
        <p className="whitespace-pre-wrap p-5 text-sm leading-relaxed text-suave">
          {anuncio.texto}
        </p>
      </Tarjeta>

      <Tarjeta className="p-5">
        <p className="text-sm font-medium text-texto">
          El detalle del inmueble está en el Portal
        </p>
        <p className="mb-4 mt-1.5 max-w-2xl text-xs leading-relaxed text-tenue">
          Eso de arriba es todo lo que publica el BOE. La tasación, las cargas, la
          situación posesoria y la referencia catastral solo existen en la ficha del
          Portal de Subastas. Se consulta ahora, solo para esta subasta.
        </p>

        <BotonConsultar id={id} />

        {anuncio.urlHtml ? (
          <div className="mt-5 border-t border-borde pt-4">
            <Enlace href={anuncio.urlHtml}>
              <IconoDoc className="size-3.5" />
              Anuncio original ({anuncio.identificador})
            </Enlace>
          </div>
        ) : null}
      </Tarjeta>
    </div>
  );
}

/* ---------------------------- auxiliares ---------------------------- */

function Volver() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-suave transition hover:text-texto"
    >
      <span aria-hidden>←</span> Volver al catálogo
    </Link>
  );
}

function Fuente({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-borde bg-superficie-alta px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-tenue">
      {children}
    </span>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
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

function Desplegable({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-borde">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium text-suave transition hover:text-texto">
        <span className="inline-block transition group-open:rotate-90" aria-hidden>
          ›
        </span>{' '}
        {titulo}
      </summary>
      <p className="whitespace-pre-wrap border-t border-borde px-4 py-3 text-xs leading-relaxed text-suave">
        {children}
      </p>
    </details>
  );
}
