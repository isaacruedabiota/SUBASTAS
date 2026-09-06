import Link from 'next/link';
import {
  contarPujas,
  listarPujas,
  resumenPujas,
  type FilaPuja,
  type FiltrosPujas,
} from '@subastas/db/consultas';
import { Aviso, Estado, IconoEuro, Tarjeta, TituloSeccion } from '@/components/ui';
import { eur, eurExacto, fechaCorta, porcentaje } from '@/lib/formato';

export const dynamic = 'force-dynamic';

/**
 * Listado de pujas.
 *
 * El dato que representa «la puja actual» es la **puja máxima** de la pestaña
 * de pujas del Portal (`estado_puja.puja_maxima`, última captura). Y tiene una
 * letra pequeña que manda sobre toda esta página: **el Portal solo publica el
 * importe cuando la subasta ha concluido**. Mientras está en curso dice si ha
 * recibido pujas o no, pero reserva la cifra a los usuarios registrados.
 */

type Query = { situacion?: string; orden?: string; estado?: string };
type Props = { searchParams: Promise<Query> };

const SITUACIONES = [
  { valor: '', texto: 'Todas' },
  { valor: 'CON_PUJAS', texto: 'Con pujas' },
  { valor: 'CONOCIDA', texto: 'Con importe' },
  { valor: 'OCULTA', texto: 'Importe reservado' },
  { valor: 'SIN_PUJAS', texto: 'Sin pujas' },
] as const;

const ORDENES = [
  { valor: '', texto: 'En curso primero' },
  { valor: 'puja', texto: 'Puja más alta' },
  { valor: 'remate', texto: 'Más se remató' },
  { valor: 'salida', texto: 'Salida más alta' },
] as const;

const ESTADOS = [
  { valor: '', texto: 'Cualquier estado' },
  { valor: 'CELEBRANDOSE', texto: 'En curso' },
  { valor: 'CONCLUIDA', texto: 'Concluidas' },
] as const;

export default async function Page({ searchParams }: Props) {
  const q = await searchParams;

  // Los valores llegan de la URL: solo se aceptan los del propio menú.
  const filtros: FiltrosPujas = {
    situacion: SITUACIONES.some((s) => s.valor === q.situacion && s.valor)
      ? (q.situacion as FiltrosPujas['situacion'])
      : undefined,
    estado: ESTADOS.some((e) => e.valor === q.estado && e.valor) ? q.estado : undefined,
    orden: ORDENES.some((o) => o.valor === q.orden && o.valor)
      ? (q.orden as FiltrosPujas['orden'])
      : undefined,
    limite: 200,
  };

  const filas = listarPujas(filtros);
  const total = contarPujas(filtros);
  const r = resumenPujas();

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica
          valor={String(r.conImporte)}
          etiqueta="Con importe"
          pie="El Portal solo lo publica al concluir"
        />
        <Metrica
          valor={String(r.ocultas)}
          etiqueta="Pujando ahora"
          pie="Consta que hay pujas; importe reservado"
          tono="dato"
        />
        <Metrica
          valor={String(r.desiertas)}
          etiqueta="Desiertas"
          pie="Concluidas sin recibir ninguna puja"
          tono="riesgo"
        />
        <Metrica
          valor={r.remateMediana === null ? '—' : porcentaje(r.remateMediana * 100)}
          etiqueta="Remate mediano"
          pie="La puja ganadora, sobre el valor de salida"
        />
      </section>

      <Aviso tono="dato">
        <strong>La puja actual es la «puja máxima» de la ficha</strong>, y el Portal
        solo publica su importe cuando la subasta ha concluido. Mientras está en curso
        declara si ha recibido pujas —eso es lo que marca «Importe reservado»— pero la
        cifra exige iniciar sesión como pujador registrado, así que aquí nunca aparece.
        Un guion no significa que no haya pujas: significa que no consta.
        {r.sobreTasacionMediana !== null ? (
          <>
            {' '}
            De las ya rematadas, la mediana se adjudicó por el{' '}
            <strong className="tabular">
              {porcentaje(r.sobreTasacionMediana * 100)}
            </strong>{' '}
            de la tasación.
          </>
        ) : null}
      </Aviso>

      <Tarjeta>
        <TituloSeccion icono={<IconoEuro className="size-4 text-tenue" />}>
          Pujas
        </TituloSeccion>

        <div className="space-y-3 border-b border-borde px-5 py-3.5">
          <Grupo etiqueta="Pujas" opciones={SITUACIONES} clave="situacion" q={q} />
          <Grupo etiqueta="Estado" opciones={ESTADOS} clave="estado" q={q} />
          <Grupo etiqueta="Orden" opciones={ORDENES} clave="orden" q={q} />
        </div>

        <p className="px-5 py-3 text-sm text-suave">
          <span className="tabular font-semibold text-texto">{total}</span>{' '}
          {total === 1 ? 'subasta' : 'subastas'} con la pestaña de pujas leída
          {total > filas.length ? (
            <span className="text-tenue"> · mostrando {filas.length}</span>
          ) : null}
        </p>

        {filas.length === 0 ? (
          <p className="px-5 pb-8 pt-4 text-center text-xs text-tenue">
            Ninguna subasta cumple estos filtros.
          </p>
        ) : (
          /* La tabla es ancha a propósito: se compara en columna. El scroll
             horizontal vive dentro de este contenedor, nunca en la página. */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] uppercase tracking-wider text-tenue">
                  <Th>Subasta</Th>
                  <Th derecha>Tasación</Th>
                  <Th derecha>Salida</Th>
                  <Th derecha>Puja máxima</Th>
                  <Th derecha>Sobre salida</Th>
                  <Th derecha>Sobre tasación</Th>
                  <Th derecha>Cierre</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <Fila key={f.subastaId} fila={f} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Fila({ fila: f }: { fila: FilaPuja }) {
  const sobreSalida =
    f.pujaMaxima !== null && f.valorSubasta ? f.pujaMaxima / f.valorSubasta : null;
  const sobreTasacion =
    f.pujaMaxima !== null && f.tasacion ? f.pujaMaxima / f.tasacion : null;

  return (
    <tr className="border-b border-borde/60 last:border-0 hover:bg-superficie-alta">
      <td className="px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Estado estado={f.estado} />
          <Link
            href={`/subasta/${f.subastaId}`}
            className="font-mono text-[11px] text-tenue hover:text-dato hover:underline"
          >
            {f.subastaId}
          </Link>
        </div>
        <p className="mt-1 max-w-md truncate text-[13px] text-texto">
          {f.direccion ?? 'Sin dirección'}
        </p>
        {f.localidad || f.provincia ? (
          <p className="text-[11px] text-tenue">
            {[f.localidad, f.provincia].filter(Boolean).join(', ')}
          </p>
        ) : null}
      </td>

      <Td>{f.tasacion ? eur(f.tasacion) : '—'}</Td>
      <Td>{f.valorSubasta ? eur(f.valorSubasta) : '—'}</Td>

      <td className="px-3 py-3 text-right">
        <ImportePuja fila={f} />
      </td>

      {/* Un remate por debajo del valor de salida es normal y legal: la salida
          es el tipo de referencia y lo que acota de verdad es la puja mínima.
          Por eso no se pinta en rojo — solo se destaca lo que sube. */}
      <Td tono={sobreSalida !== null && sobreSalida >= 1 ? 'oportunidad' : 'normal'}>
        {sobreSalida !== null ? porcentaje(sobreSalida * 100) : '—'}
      </Td>
      <Td>{sobreTasacion !== null ? porcentaje(sobreTasacion * 100) : '—'}</Td>
      <Td tenue>{fechaCorta(f.fechaConclusion)}</Td>
    </tr>
  );
}

/**
 * ⚠️ Nunca decir «Sin pujas» sin que el Portal lo haya dicho. Es el mismo
 * criterio que con las cargas: la falta de dato no es la ausencia del hecho.
 */
function ImportePuja({ fila: f }: { fila: FilaPuja }) {
  if (f.pujaMaxima !== null) {
    /* Con lotes el Portal da una cifra por lote; esto es la suma de los leídos.
       Si no están todos, hay que decirlo: una suma parcial no es la puja por el
       conjunto y leerla como tal es exactamente el error que evitamos. */
    const parcial = f.lotes > 1 && f.lotesConImporte < f.lotes;
    return (
      <>
        <span className="tabular font-semibold text-texto">
          {eurExacto(f.pujaMaxima)}
        </span>
        {parcial ? (
          <span
            className="ml-1.5 whitespace-nowrap text-[10px] text-tenue"
            title={`Suma de ${f.lotesConImporte} de ${f.lotes} lotes; del resto no consta importe`}
          >
            {f.lotesConImporte}/{f.lotes} lotes
          </span>
        ) : null}
      </>
    );
  }

  if (f.situacion === 'OCULTA') {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dato-borde bg-dato-fondo px-2 py-0.5 text-[11px] font-medium text-dato"
        title="El Portal declara que la subasta ha recibido pujas, pero reserva el importe a los usuarios registrados"
      >
        Hay pujas
      </span>
    );
  }

  if (f.situacion === 'SECRETA') {
    return <span className="text-[11px] text-suave">Puja secreta</span>;
  }

  if (f.situacion === 'SIN_PUJAS') {
    return <span className="text-[11px] text-tenue">Sin pujas</span>;
  }

  return <span className="text-[11px] text-tenue">No consta</span>;
}

function Th({ children, derecha }: { children: React.ReactNode; derecha?: boolean }) {
  return (
    <th
      className={`px-3 py-2.5 font-medium first:pl-5 last:pr-5 ${
        derecha ? 'text-right' : ''
      }`}
      scope="col"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  tenue,
  tono = 'normal',
}: {
  children: React.ReactNode;
  tenue?: boolean;
  tono?: 'normal' | 'oportunidad';
}) {
  return (
    <td
      className={`tabular px-3 py-3 text-right last:pr-5 ${
        tono === 'oportunidad'
          ? 'font-medium text-oportunidad'
          : tenue
            ? 'text-tenue'
            : 'text-suave'
      }`}
    >
      {children}
    </td>
  );
}

/** Grupo de filtros. Enlaces normales: la página es de servidor entera. */
function Grupo({
  etiqueta,
  opciones,
  clave,
  q,
}: {
  etiqueta: string;
  opciones: ReadonlyArray<{ valor: string; texto: string }>;
  clave: keyof Query;
  q: Query;
}) {
  const activo = q[clave] ?? '';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-14 shrink-0 text-[11px] uppercase tracking-wider text-tenue">
        {etiqueta}
      </span>
      {opciones.map((o) => {
        const params = new URLSearchParams(
          Object.entries(q).filter(([, v]) => v) as [string, string][],
        );
        if (o.valor) params.set(clave, o.valor);
        else params.delete(clave);
        const query = params.toString();

        return (
          <Link
            key={o.valor || 'todas'}
            href={`/pujas${query ? `?${query}` : ''}`}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              activo === o.valor
                ? 'border-dato-borde bg-dato-fondo text-dato'
                : 'border-borde bg-superficie-alta text-suave hover:text-texto'
            }`}
          >
            {o.texto}
          </Link>
        );
      })}
    </div>
  );
}

function Metrica({
  valor,
  etiqueta,
  pie,
  tono,
}: {
  valor: string;
  etiqueta: string;
  pie: string;
  tono?: 'dato' | 'riesgo';
}) {
  return (
    <Tarjeta className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-tenue">
        {etiqueta}
      </p>
      <p
        className={`tabular mt-1.5 text-3xl font-semibold leading-none ${
          tono === 'dato'
            ? 'text-dato'
            : tono === 'riesgo'
              ? 'text-riesgo'
              : 'text-texto'
        }`}
      >
        {valor}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-tenue">{pie}</p>
    </Tarjeta>
  );
}
