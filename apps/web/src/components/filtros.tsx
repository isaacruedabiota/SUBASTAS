import Link from 'next/link';
import { IconoBuscar } from './ui';

export interface ValoresFiltro {
  q?: string;
  provincia?: string;
  localidad?: string;
  tipo?: string;
  estado?: string;
  ficha?: string;
  precioMin?: string;
  precioMax?: string;
  superficieMin?: string;
  superficieMax?: string;
  anioMin?: string;
  descuentoMin?: string;
  sinCargas?: string;
  fotos?: string;
  orden?: string;
}

/**
 * Panel de filtros. Es un `<form method=GET>` sin JavaScript: el estado vive en
 * la URL, así que cualquier búsqueda es enlazable y el botón atrás funciona.
 */
export function Filtros({
  valores,
  provincias,
  poblaciones,
  tipos,
  accion = '/',
  extra,
}: {
  valores: ValoresFiltro;
  provincias: Array<{ provincia: string; n: number }>;
  /** Poblaciones para el desplegable. Se acotan a la provincia ya elegida. */
  poblaciones: Array<{ localidad: string; n: number }>;
  tipos: string[];
  accion?: string;
  extra?: React.ReactNode;
}) {
  const hayFiltros = Object.entries(valores).some(
    ([k, v]) => k !== 'orden' && v !== undefined && v !== '',
  );

  return (
    <form
      action={accion}
      className="space-y-4 rounded-xl border border-borde bg-superficie p-4"
    >
      {/* Búsqueda principal */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <IconoBuscar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tenue" />
          <input
            type="search"
            name="q"
            defaultValue={valores.q ?? ''}
            placeholder="Localidad, dirección o descripción…"
            className="w-full rounded-lg border border-borde bg-fondo py-2.5 pl-9 pr-3 text-sm text-texto placeholder:text-tenue focus:border-borde-fuerte focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-acento px-5 py-2.5 text-sm font-medium text-acento-texto transition hover:opacity-90"
        >
          Filtrar
        </button>
      </div>

      {/* Rangos y desplegables */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Provincia">
          <select
            name="provincia"
            defaultValue={valores.provincia ?? ''}
            className={claseControl}
          >
            <option value="">Todas</option>
            {provincias.map((p) => (
              <option key={p.provincia} value={p.provincia}>
                {p.provincia} ({p.n})
              </option>
            ))}
          </select>
        </Campo>

        {/* Población: se escribe o se elige de la lista. Un <select> de 900
            opciones sería inmanejable, y `datalist` no necesita JavaScript. La
            lista se acota sola a la provincia elegida en cuanto se filtra. */}
        <Campo etiqueta="Población">
          <input
            type="text"
            name="localidad"
            list="lista-poblaciones"
            defaultValue={valores.localidad ?? ''}
            placeholder={
              poblaciones.length > 0
                ? `Todas (${poblaciones.length})`
                : 'Todas'
            }
            className={claseControl}
          />
          <datalist id="lista-poblaciones">
            {poblaciones.map((p) => (
              <option key={p.localidad} value={p.localidad}>
                {p.n} {p.n === 1 ? 'inmueble' : 'inmuebles'}
              </option>
            ))}
          </datalist>
        </Campo>

        <Campo etiqueta="Tipo de subasta">
          <select name="tipo" defaultValue={valores.tipo ?? ''} className={claseControl}>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Estado">
          <select
            name="estado"
            defaultValue={valores.estado ?? ''}
            className={claseControl}
          >
            <option value="">Cualquiera</option>
            <option value="CELEBRANDOSE">En curso</option>
            <option value="PROXIMA_APERTURA">Próxima apertura</option>
            <option value="CONCLUIDA">Concluida</option>
            <option value="SUSPENDIDA">Suspendida</option>
          </select>
        </Campo>

        <Campo etiqueta="Ordenar por">
          <select name="orden" defaultValue={valores.orden ?? 'fecha'} className={claseControl}>
            <option value="fecha">Fecha de conclusión</option>
            <option value="precio">Precio (menor primero)</option>
            <option value="descuento">Mayor descuento</option>
            <option value="superficie">Mayor superficie</option>
          </select>
        </Campo>

        <Campo etiqueta="Precio (€)">
          <div className="flex gap-2">
            <input
              type="number"
              name="precioMin"
              min="0"
              step="1000"
              placeholder="Desde"
              defaultValue={valores.precioMin ?? ''}
              className={claseControl}
            />
            <input
              type="number"
              name="precioMax"
              min="0"
              step="1000"
              placeholder="Hasta"
              defaultValue={valores.precioMax ?? ''}
              className={claseControl}
            />
          </div>
        </Campo>

        <Campo etiqueta="Superficie (m²)">
          <div className="flex gap-2">
            <input
              type="number"
              name="superficieMin"
              min="0"
              placeholder="Desde"
              defaultValue={valores.superficieMin ?? ''}
              className={claseControl}
            />
            <input
              type="number"
              name="superficieMax"
              min="0"
              placeholder="Hasta"
              defaultValue={valores.superficieMax ?? ''}
              className={claseControl}
            />
          </div>
        </Campo>

        <Campo etiqueta="Año mínimo">
          <input
            type="number"
            name="anioMin"
            min="1800"
            max="2100"
            placeholder="p. ej. 1990"
            defaultValue={valores.anioMin ?? ''}
            className={claseControl}
          />
        </Campo>

        <Campo etiqueta="Descuento mínimo (%)">
          <input
            type="number"
            name="descuentoMin"
            min="0"
            max="100"
            placeholder="p. ej. 30"
            defaultValue={valores.descuentoMin ?? ''}
            className={claseControl}
          />
        </Campo>
      </div>

      {/* Interruptores */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-borde pt-3">
        <Interruptor nombre="ficha" marcado={valores.ficha === '1'}>
          Solo con ficha leída
        </Interruptor>
        <Interruptor
          nombre="sinCargas"
          marcado={valores.sinCargas === '1'}
          ayuda="Solo las que el Portal informa expresamente sin cargas. «No consta» no cuenta."
        >
          Sin cargas
        </Interruptor>
        <Interruptor
          nombre="fotos"
          marcado={valores.fotos === '1'}
          ayuda="Solo las que el Portal publica con fotos del inmueble. Son ~1 de cada 20, y casi todas de la Unidad de Subastas Judiciales de Murcia."
        >
          Con fotos
        </Interruptor>

        {extra}

        {hayFiltros ? (
          <Link
            href={accion}
            className="ml-auto text-xs font-medium text-dato hover:underline"
          >
            Limpiar filtros
          </Link>
        ) : null}
      </div>
    </form>
  );
}

const claseControl =
  'w-full rounded-lg border border-borde bg-fondo px-2.5 py-2 text-sm text-texto placeholder:text-tenue focus:border-borde-fuerte focus:outline-none';

function Campo({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-tenue">
        {etiqueta}
      </span>
      {children}
    </label>
  );
}

function Interruptor({
  nombre,
  marcado,
  ayuda,
  children,
}: {
  nombre: string;
  marcado: boolean;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 text-sm text-suave"
      title={ayuda}
    >
      <input
        type="checkbox"
        name={nombre}
        value="1"
        defaultChecked={marcado}
        className="size-4 accent-[var(--dato)]"
      />
      {children}
    </label>
  );
}
