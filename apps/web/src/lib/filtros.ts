import type { FiltrosCatalogo } from '@subastas/db/consultas';
import type { ValoresFiltro } from '@/components/filtros';

/**
 * Traduce los parámetros de la URL a filtros de consulta.
 * Los precios se escriben en euros en la interfaz y viajan en céntimos por dentro.
 */

const num = (v: string | undefined): number | undefined => {
  if (!v || v.trim() === '') return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

const centimos = (v: string | undefined): number | undefined => {
  const n = num(v);
  return n === undefined ? undefined : Math.round(n * 100);
};

const ORDENES_VALIDOS = new Set(['fecha', 'precio', 'descuento', 'superficie']);

export function aFiltros(p: ValoresFiltro, limite = 60): FiltrosCatalogo {
  const orden = p.orden && ORDENES_VALIDOS.has(p.orden) ? p.orden : 'fecha';

  return {
    texto: p.q?.trim() || undefined,
    provincia: p.provincia || undefined,
    localidad: p.localidad?.trim() || undefined,
    tipo: p.tipo || undefined,
    estado: p.estado || undefined,
    soloConFicha: p.ficha === '1' || undefined,
    precioMin: centimos(p.precioMin),
    precioMax: centimos(p.precioMax),
    superficieMin: num(p.superficieMin),
    superficieMax: num(p.superficieMax),
    anioMin: num(p.anioMin),
    descuentoMin: num(p.descuentoMin),
    sinCargas: p.sinCargas === '1' || undefined,
    conFotos: p.fotos === '1' || undefined,
    orden: orden as FiltrosCatalogo['orden'],
    limite,
  };
}

/** Conserva los filtros al saltar entre listado y mapa. */
export function comoQuery(p: ValoresFiltro): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}
