import Link from 'next/link';
import { localidades, puntosMapa, rangos, resumen } from '@subastas/db/consultas';
import { Filtros, type ValoresFiltro } from '@/components/filtros';
import { Mapa } from '@/components/mapa';
import { Tarjeta } from '@/components/ui';
import { aFiltros, comoQuery } from '@/lib/filtros';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<ValoresFiltro> };

export default async function PaginaMapa({ searchParams }: Props) {
  const p = await searchParams;

  const puntos = puntosMapa(aFiltros(p, 2000));
  const stats = resumen();
  const r = rangos();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-texto">Mapa</h1>
          <p className="mt-1 text-sm text-suave">
            <span className="tabular font-semibold text-texto">{puntos.length}</span>{' '}
            {puntos.length === 1 ? 'inmueble situado' : 'inmuebles situados'}
            <span className="text-tenue">
              {' '}
              · de {stats.inmueblesEnriquecidos} con datos de Catastro
            </span>
          </p>
        </div>
        <Link
          href={`/${comoQuery(p)}`}
          className="text-xs font-medium text-dato hover:underline"
        >
          ← Volver al listado
        </Link>
      </div>

      <Filtros
        valores={p}
        provincias={stats.provincias}
        poblaciones={localidades(p.provincia || undefined)}
        tipos={r.tipos}
        accion="/mapa"
      />

      {puntos.length === 0 ? (
        <Tarjeta className="px-6 py-16 text-center">
          <p className="text-sm font-medium text-texto">Nada que situar todavía</p>
          <p className="mx-auto mt-1.5 max-w-lg text-xs leading-relaxed text-tenue">
            Las coordenadas vienen de Catastro, y para consultarlo hace falta la
            referencia catastral de la ficha del Portal. Lee fichas con el botón de cada
            subasta, o lanza la precarga:
          </p>
          <code className="mt-4 inline-block rounded-md border border-borde bg-superficie-alta px-3 py-1.5 font-mono text-xs text-suave">
            npm run precargar
          </code>
        </Tarjeta>
      ) : (
        <>
          <Mapa puntos={puntos} />
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-tenue">
            <span className="font-medium">Color según descuento:</span>
            <Leyenda color="#059669">30% o más bajo tasación</Leyenda>
            <Leyenda color="#65a30d">Entre 10% y 30%</Leyenda>
            <Leyenda color="#64748b">Menos del 10% o sin datos</Leyenda>
          </div>
        </>
      )}
    </div>
  );
}

function Leyenda({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-2.5 rounded-full ring-2 ring-superficie"
        style={{ backgroundColor: color }}
      />
      {children}
    </span>
  );
}
