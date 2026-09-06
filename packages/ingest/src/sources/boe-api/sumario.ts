import { SumarioBoe, itemsDelSumario, type ItemBoe } from '@subastas/core';
import { fetchTexto } from '../../http';

const BASE = 'https://www.boe.es/datosabiertos/api/boe/sumario';

export interface ItemLocalizado {
  item: ItemBoe;
  seccionCodigo: string;
  seccionNombre: string;
  fecha: string;
}

/** `fecha` en formato AAAAMMDD. */
export async function obtenerSumario(fecha: string): Promise<ItemLocalizado[]> {
  const crudo = await fetchTexto(`${BASE}/${fecha}`, {
    headers: { Accept: 'application/json' },
  });

  const sumario = SumarioBoe.parse(JSON.parse(crudo));

  return [...itemsDelSumario(sumario)].map((x) => ({ ...x, fecha }));
}

/**
 * Distingue una subasta de bienes del mucho ruido que comparte vocabulario.
 *
 * Ruido observado en anuncios reales:
 *  - Órdenes de "derecho de tanteo" sobre lotes de arte ya subastados.
 *  - Adjudicación y formalización de contratos públicos.
 *  - Subastas de DEUDA PÚBLICA del Tesoro (Obligaciones, Bonos, Letras).
 *    Son literalmente subastas, pero de deuda, no de bienes: nada que ver
 *    con el objeto de este proyecto y aparecen con mucha frecuencia.
 */
const RUIDO =
  /derecho de tanteo|tanteo y retracto|formalizaci[oó]n del contrato|adjudicaci[oó]n del contrato|licitaci[oó]n|obligaciones del estado|letras del tesoro|bonos (?:y obligaciones|del estado)|deuda (?:del estado|p[uú]blica)/i;

export function esConvocatoriaDeSubasta(titulo: string): boolean {
  if (!/subasta/i.test(titulo)) return false;
  return !RUIDO.test(titulo);
}

/**
 * Secciones que se descargan ENTERAS, sin mirar el título.
 *
 * Los edictos judiciales de la sección 4 se titulan con el nombre del partido
 * judicial ("DOS HERMANAS", "SEVILLA", "VALENCIA") y no contienen la palabra
 * "subasta" por ninguna parte, pero su cuerpo sí trae el SUB-JA-* del Portal.
 * Filtrar por título dejaba fuera TODAS las subastas judiciales.
 *
 * Son secciones pequeñas (~8 y ~3 items/día), así que bajarlas enteras sale
 * barato comparado con perderse la mitad del catálogo.
 */
export const SECCIONES_COMPLETAS = new Set(['4', '5C']);

/**
 * Candidatos a descargar: todo lo de las secciones completas, más cualquier
 * item cuyo título ya delate una subasta (AEAT en 5B, Hacienda, AENA...).
 */
export function filtrarCandidatos(items: ItemLocalizado[]): ItemLocalizado[] {
  return items.filter(
    (x) =>
      SECCIONES_COMPLETAS.has(x.seccionCodigo) || esConvocatoriaDeSubasta(x.item.titulo),
  );
}

/** Genera las fechas AAAAMMDD de un rango, ambas inclusive. */
export function* rangoDeFechas(desde: Date, hasta: Date): Generator<string> {
  const d = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  const fin = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());

  while (d.getTime() <= fin) {
    yield `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
