import Link from 'next/link';
import { avisosPendientes, listarAlertas } from '@subastas/db/alertas';
import { rangos, resumen } from '@subastas/db/consultas';
import { Aviso, Tarjeta, TituloSeccion, IconoAviso } from '@/components/ui';
import { eur, fecha } from '@/lib/formato';
import {
  conmutarAlerta,
  eliminarAlerta,
  guardarAlerta,
  marcarVistos,
  revisarAlertas,
} from '../acciones';

export const dynamic = 'force-dynamic';

export default async function PaginaAlertas() {
  const alertas = listarAlertas();
  const avisos = avisosPendientes(60);
  const stats = resumen();
  const r = rangos();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-texto">Alertas</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-suave">
          Guarda unos criterios y te avisa cuando aparecen subastas que encajan. Se
          revisan al crearlas, tras cada precarga, o cuando pulses «Revisar ahora».
        </p>
      </div>

      {/* -------- Avisos pendientes -------- */}
      <Tarjeta>
        <TituloSeccion
          icono={<IconoAviso className="size-4 text-tenue" />}
          extra={
            avisos.length > 0 ? (
              <form action={marcarVistos}>
                <button className="text-xs font-medium text-dato hover:underline">
                  Marcar todos como vistos
                </button>
              </form>
            ) : null
          }
        >
          Avisos pendientes{avisos.length > 0 ? ` (${avisos.length})` : ''}
        </TituloSeccion>

        {avisos.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-tenue">
            Ningún aviso pendiente.
          </p>
        ) : (
          <ul className="divide-y divide-borde">
            {avisos.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/subasta/${a.subastaId}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 transition hover:bg-superficie-alta"
                >
                  <span className="rounded-full border border-dato-borde bg-dato-fondo px-2 py-0.5 text-[11px] font-medium text-dato">
                    {a.alertaNombre}
                  </span>
                  <span className="text-sm text-texto">{a.detalle ?? a.subastaId}</span>
                  <span className="ml-auto font-mono text-[11px] text-tenue">
                    {a.subastaId}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {/* -------- Alertas guardadas -------- */}
      <Tarjeta>
        <TituloSeccion
          extra={
            alertas.length > 0 ? (
              <form action={revisarAlertas}>
                <button className="text-xs font-medium text-dato hover:underline">
                  Revisar ahora
                </button>
              </form>
            ) : null
          }
        >
          Alertas guardadas
        </TituloSeccion>

        {alertas.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-tenue">
            Todavía no has creado ninguna.
          </p>
        ) : (
          <ul className="divide-y divide-borde">
            {alertas.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-texto">
                    <span
                      className={`size-1.5 rounded-full ${
                        a.activa ? 'bg-activo' : 'bg-inactivo'
                      }`}
                    />
                    {a.nombre}
                  </p>
                  <p className="mt-1 text-xs text-tenue">{describir(a)}</p>
                  {a.ultimaRevisionEn ? (
                    <p className="mt-0.5 text-[11px] text-tenue">
                      Revisada el {fecha(a.ultimaRevisionEn)}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 gap-2">
                  <form action={conmutarAlerta}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded-md border border-borde px-2.5 py-1.5 text-xs text-suave transition hover:border-borde-fuerte hover:text-texto">
                      {a.activa ? 'Pausar' : 'Activar'}
                    </button>
                  </form>
                  <form action={eliminarAlerta}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded-md border border-borde px-2.5 py-1.5 text-xs text-riesgo transition hover:border-riesgo-borde">
                      Borrar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {/* -------- Nueva alerta -------- */}
      <Tarjeta>
        <TituloSeccion>Nueva alerta</TituloSeccion>

        <form action={guardarAlerta} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo etiqueta="Nombre" ancho>
              <input
                name="nombre"
                required
                placeholder="p. ej. Pisos baratos en Valencia"
                className={control}
              />
            </Campo>

            <Campo etiqueta="Texto a buscar">
              <input name="texto" placeholder="Opcional" className={control} />
            </Campo>

            <Campo etiqueta="Provincia">
              <select name="provincia" className={control} defaultValue="">
                <option value="">Todas</option>
                {stats.provincias.map((p) => (
                  <option key={p.provincia} value={p.provincia}>
                    {p.provincia}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Tipo de subasta">
              <select name="tipo" className={control} defaultValue="">
                <option value="">Todos</option>
                {r.tipos.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Precio (€)">
              <div className="flex gap-2">
                <input
                  name="precioMin"
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="Desde"
                  className={control}
                />
                <input
                  name="precioMax"
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="Hasta"
                  className={control}
                />
              </div>
            </Campo>

            <Campo etiqueta="Superficie (m²)">
              <div className="flex gap-2">
                <input
                  name="superficieMin"
                  type="number"
                  min="0"
                  placeholder="Desde"
                  className={control}
                />
                <input
                  name="superficieMax"
                  type="number"
                  min="0"
                  placeholder="Hasta"
                  className={control}
                />
              </div>
            </Campo>

            <Campo etiqueta="Año mínimo">
              <input
                name="anioMin"
                type="number"
                min="1800"
                max="2100"
                placeholder="p. ej. 1990"
                className={control}
              />
            </Campo>

            <Campo etiqueta="Descuento mínimo (%)">
              <input
                name="descuentoMin"
                type="number"
                min="0"
                max="100"
                placeholder="p. ej. 30"
                className={control}
              />
            </Campo>
          </div>

          <div className="flex flex-wrap items-center gap-5 border-t border-borde pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-suave">
              <input
                type="checkbox"
                name="soloActivas"
                value="1"
                defaultChecked
                className="size-4 accent-[var(--dato)]"
              />
              Solo subastas en curso
            </label>
            <label
              className="flex cursor-pointer items-center gap-2 text-sm text-suave"
              title="«No consta» no cuenta como libre de cargas"
            >
              <input
                type="checkbox"
                name="sinCargas"
                value="1"
                className="size-4 accent-[var(--dato)]"
              />
              Solo sin cargas
            </label>

            <button
              type="submit"
              className="ml-auto rounded-lg bg-acento px-5 py-2.5 text-sm font-medium text-acento-texto transition hover:opacity-90"
            >
              Crear alerta
            </button>
          </div>

          <Aviso tono="dato">
            Los criterios de precio, superficie, año y descuento solo pueden evaluarse
            sobre subastas cuya ficha ya se haya leído del Portal. Con la precarga en
            marcha, la cobertura crece sola.
          </Aviso>
        </form>
      </Tarjeta>
    </div>
  );
}

const control =
  'w-full rounded-lg border border-borde bg-fondo px-2.5 py-2 text-sm text-texto placeholder:text-tenue focus:border-borde-fuerte focus:outline-none';

function Campo({
  etiqueta,
  children,
  ancho,
}: {
  etiqueta: string;
  children: React.ReactNode;
  ancho?: boolean;
}) {
  return (
    <label className={`block space-y-1.5 ${ancho ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-tenue">
        {etiqueta}
      </span>
      {children}
    </label>
  );
}

/** Resume los criterios en una línea legible. */
function describir(a: ReturnType<typeof listarAlertas>[number]): string {
  const partes: string[] = [];
  if (a.provincia) partes.push(a.provincia);
  if (a.texto) partes.push(`«${a.texto}»`);
  if (a.tipo) partes.push(a.tipo);
  if (a.precioMin !== null || a.precioMax !== null) {
    partes.push(
      `${a.precioMin !== null ? eur(a.precioMin) : '—'} a ${
        a.precioMax !== null ? eur(a.precioMax) : '—'
      }`,
    );
  }
  if (a.superficieMin !== null || a.superficieMax !== null) {
    partes.push(`${a.superficieMin ?? '—'}–${a.superficieMax ?? '—'} m²`);
  }
  if (a.anioMin !== null) partes.push(`desde ${a.anioMin}`);
  if (a.descuentoMin !== null) partes.push(`−${a.descuentoMin}% o más`);
  if (a.sinCargas) partes.push('sin cargas');
  if (a.soloActivas) partes.push('en curso');

  return partes.length > 0 ? partes.join(' · ') : 'Sin criterios: avisa de todo';
}
