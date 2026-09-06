import Link from 'next/link';
import {
  contarCatalogo,
  listarCatalogo,
  localidades,
  rangos,
  resumen,
} from '@subastas/db/consultas';
import { estadoCola } from '@subastas/db/cola';
import {
  BarraDescuento,
  Estado,
  IconoCamara,
  IconoCasa,
  IconoMapa,
  IconoReloj,
  IconoUbicacion,
  Tarjeta,
} from '@/components/ui';
import { Filtros, type ValoresFiltro } from '@/components/filtros';
import { Carrusel } from '@/components/carrusel';
import { aFiltros, comoQuery } from '@/lib/filtros';
import { descuento, diasRestantes, eur, eurCorto, fechaCorta, metros } from '@/lib/formato';

export const dynamic = 'force-dynamic';

/** En Next.js 16 `searchParams` es una Promise. */
type Props = { searchParams: Promise<ValoresFiltro> };

export default async function Page({ searchParams }: Props) {
  const p = await searchParams;

  const filtros = aFiltros(p);
  const filas = listarCatalogo(filtros);
  const total = contarCatalogo(filtros);
  const stats = resumen();
  const cola = estadoCola();
  const r = rangos();

  return (
    <div className="space-y-6">
      {/* ---------------- Resumen ---------------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica
          valor={stats.subastasCatalogo}
          etiqueta="En el catálogo"
          pie="Identificadas por el BOE"
        />
        <Metrica
          valor={stats.fichasLeidas}
          etiqueta="Fichas leídas"
          pie="Consultadas al Portal"
          proporcion={stats.subastasCatalogo}
        />
        <Metrica
          valor={stats.inmueblesEnriquecidos}
          etiqueta="Con datos de Catastro"
          pie="Superficie, año y uso"
          tono="dato"
        />
        <Metrica
          valor={cola.pendientes}
          etiqueta="Fichas pendientes"
          pie="En cola de precarga"
        />
      </section>

      <Filtros
        valores={p}
        provincias={stats.provincias}
        poblaciones={localidades(filtros.provincia)}
        tipos={r.tipos}
      />

      {/* ---------------- Resultados ---------------- */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-suave">
          <span className="tabular font-semibold text-texto">{total}</span>{' '}
          {total === 1 ? 'subasta' : 'subastas'}
          {total > filas.length ? (
            <span className="text-tenue"> · mostrando {filas.length}</span>
          ) : null}
        </p>
        <Link
          href={`/mapa${comoQuery(p)}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-dato hover:underline"
        >
          <IconoMapa className="size-3.5" />
          Ver estos resultados en el mapa
        </Link>
      </div>

      {filas.length === 0 ? (
        <Tarjeta className="px-6 py-14 text-center">
          <p className="text-sm font-medium text-texto">Sin resultados</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-tenue">
            {total === 0 && stats.subastasCatalogo > 0
              ? 'Ningún resultado con estos filtros. Ten en cuenta que precio, superficie y descuento solo se pueden filtrar en subastas cuya ficha ya se haya leído.'
              : 'El catálogo está vacío. Ejecuta la ingesta del BOE para poblarlo.'}
          </p>
          {stats.subastasCatalogo === 0 ? (
            <code className="mt-4 inline-block rounded-md border border-borde bg-superficie-alta px-3 py-1.5 font-mono text-xs text-suave">
              npm run ingest -- --dias 30
            </code>
          ) : null}
        </Tarjeta>
      ) : (
        <ul className="space-y-2.5">
          {filas.map((f) => (
            <li key={f.subastaId}>
              <FilaSubasta fila={f} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FilaSubasta({ fila: f }: { fila: ReturnType<typeof listarCatalogo>[number] }) {
  const superficie = f.superficieConstruida || f.superficieSuelo;
  const dias = diasRestantes(f.fechaConclusion);
  const dto = descuento(f.tasacion, f.valorSubasta);

  return (
    /* No es un <a> envolviéndolo todo: el carrusel lleva botones, y HTML no
       permite controles dentro de un enlace. En su lugar el título estira su
       ::after sobre toda la tarjeta, que sigue siendo clicable entera, y las
       flechas quedan por encima con z-10. */
    <div className="group relative rounded-xl border border-borde bg-superficie p-4 transition hover:border-borde-fuerte hover:shadow-[0_2px_8px_rgb(0_0_0/0.06)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Carrusel
          fotos={f.fotos}
          lat={f.lat}
          lon={f.lon}
          alt={f.direccion ?? f.subastaId}
        />

        {/* Identidad y ubicación */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Estado estado={f.estado} />
            <span className="font-mono text-[11px] text-tenue">{f.subastaId}</span>
            {/* Las fotos del Portal son raras (~1 de cada 20): merece distintivo. */}
            {f.numeroFotos > 0 ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-dato-borde bg-dato-fondo px-2 py-0.5 text-[10px] font-medium text-dato"
                title={`El Portal publica ${f.numeroFotos} fotografía${f.numeroFotos === 1 ? '' : 's'} del inmueble`}
              >
                <IconoCamara className="size-3" />
                {f.numeroFotos}
              </span>
            ) : null}
          </div>

          <h3 className="truncate text-[15px] font-medium leading-snug text-texto group-hover:text-dato">
            <Link
              href={`/subasta/${f.subastaId}`}
              className="after:absolute after:inset-0 after:rounded-xl"
            >
              {f.direccion ?? f.tituloBoe ?? 'Sin dirección'}
            </Link>
          </h3>

          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-suave">
            <span className="inline-flex items-center gap-1.5">
              <IconoUbicacion className="size-3.5 text-tenue" />
              {[f.localidad, f.provincia].filter(Boolean).join(', ') ||
                'Localidad por determinar'}
            </span>

            {superficie ? (
              <span className="inline-flex items-center gap-1.5">
                <IconoCasa className="size-3.5 text-tenue" />
                {metros(superficie)}
                {f.anioConstruccion ? ` · ${f.anioConstruccion}` : ''}
                {f.usoPrincipal ? ` · ${f.usoPrincipal}` : ''}
              </span>
            ) : null}

            {dias !== null && dias >= 0 && f.estado === 'CELEBRANDOSE' ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-riesgo">
                <IconoReloj className="size-3.5" />
                {dias === 0 ? 'Termina hoy' : `${dias} día${dias === 1 ? '' : 's'}`}
              </span>
            ) : null}
          </div>
        </div>

        {/* Economía */}
        <div className="shrink-0 sm:w-52">
          {f.valorSubasta ? (
            <div className="space-y-2 sm:text-right">
              <div>
                <p className="tabular text-lg font-semibold leading-none text-texto">
                  {eur(f.valorSubasta)}
                </p>
                {f.tasacion && dto !== null && dto > 0 ? (
                  <p className="tabular mt-1 text-[11px] text-tenue">
                    Tasado en {eur(f.tasacion)}
                  </p>
                ) : null}
              </div>
              <div className="sm:text-left">
                <BarraDescuento
                  tasacion={f.tasacion}
                  valorSubasta={f.valorSubasta}
                  pujaMaxima={f.pujaMaxima}
                />
              </div>

              <CondicionesPuja fila={f} />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-borde px-3 py-2.5 text-center">
              <p className="text-[11px] leading-relaxed text-tenue">
                Importes en el Portal
                <br />
                <span className="text-dato">Abrir para consultar →</span>
              </p>
            </div>
          )}

          {f.fechaConclusion ? (
            <p className="tabular mt-2 text-[11px] text-tenue sm:text-right">
              Hasta {fechaCorta(f.fechaConclusion)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Lo que hace falta para pujar, resumido en tres cifras.
 *
 * ⚠️ El **valor de salida no es un suelo**, es la referencia: dos de cada tres
 * subastas de la AEAT rematan por debajo. Lo que de verdad acota es esto:
 *
 * - **Desde**: la puja mínima si la hay; si ya hay pujas, manda la última, que
 *   es a partir de donde habrá que subir. Cuando el Portal dice «Sin puja
 *   mínima» se pone eso y no un hueco: es una afirmación suya, no un dato que
 *   falte.
 * - **Depósito**: sin constituirlo no se puede pujar, así que en la práctica es
 *   el desembolso mínimo real.
 * - **Tramo**: el escalón entre una puja y la siguiente.
 */
function CondicionesPuja({ fila: f }: { fila: ReturnType<typeof listarCatalogo>[number] }) {
  const hayPuja = f.pujaMaxima !== null;

  const desde = hayPuja
    ? { texto: eurCorto(f.pujaMaxima), etiqueta: 'Puja actual', tono: 'text-texto' }
    : f.situacionPuja === 'OCULTA'
      ? { texto: 'Hay pujas', etiqueta: 'Importe reservado', tono: 'text-dato' }
      : f.pujaMinima !== null
        ? { texto: eurCorto(f.pujaMinima), etiqueta: 'Pujar desde', tono: 'text-texto' }
        : f.pujaMinimaSituacion === 'SIN_MINIMA'
          ? { texto: 'Sin mínimo', etiqueta: 'Pujar desde', tono: 'text-suave' }
          : f.pujaMinimaSituacion === 'POR_LOTE'
            ? { texto: 'Según lote', etiqueta: 'Pujar desde', tono: 'text-suave' }
            : null;

  if (!desde && f.importeDeposito === null && f.tramosEntrePujas === null) return null;

  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 border-t border-borde pt-2 text-[11px] sm:justify-end">
      {desde ? (
        <Condicion etiqueta={desde.etiqueta} valor={desde.texto} tono={desde.tono} />
      ) : null}
      {f.importeDeposito !== null ? (
        <Condicion etiqueta="Depósito" valor={eurCorto(f.importeDeposito)} />
      ) : null}
      {f.tramosEntrePujas !== null ? (
        <Condicion etiqueta="Tramo" valor={eurCorto(f.tramosEntrePujas)} />
      ) : null}
    </dl>
  );
}

function Condicion({
  etiqueta,
  valor,
  tono = 'text-suave',
}: {
  etiqueta: string;
  valor: string;
  tono?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-tenue">{etiqueta}</dt>
      <dd className={`tabular font-medium ${tono}`}>{valor}</dd>
    </div>
  );
}

function Metrica({
  valor,
  etiqueta,
  pie,
  proporcion,
  tono,
}: {
  valor: number;
  etiqueta: string;
  pie: string;
  proporcion?: number;
  tono?: 'dato';
}) {
  const pct =
    proporcion && proporcion > 0 ? Math.round((valor / proporcion) * 100) : null;

  return (
    <Tarjeta className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-tenue">
        {etiqueta}
      </p>
      <p
        className={`tabular mt-1.5 text-3xl font-semibold leading-none ${
          tono === 'dato' ? 'text-dato' : 'text-texto'
        }`}
      >
        {valor}
        {pct !== null ? (
          <span className="ml-1.5 text-xs font-normal text-tenue">{pct}%</span>
        ) : null}
      </p>
      <p className="mt-1.5 text-[11px] text-tenue">{pie}</p>
    </Tarjeta>
  );
}
