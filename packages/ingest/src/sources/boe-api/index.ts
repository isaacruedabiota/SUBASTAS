import { guardarAnuncio } from '@subastas/db/anuncios';
import {
  esConvocatoriaDeSubasta,
  filtrarCandidatos,
  obtenerSumario,
  rangoDeFechas,
  type ItemLocalizado,
} from './sumario';
import {
  extraerIdentificadoresPortal,
  extraerReferenciasCatastrales,
  obtenerAnuncio,
} from './anuncio';

export interface ResumenIngesta {
  diasConsultados: number;
  diasSinBoletin: number;
  itemsTotales: number;
  /** Items descargados para inspeccionar su texto. */
  candidatosInspeccionados: number;
  anunciosGuardados: number;
  conReferenciaCatastral: number;
  /** Anuncios que enlazan una subasta del Portal. Es el puente BOE → Portal. */
  conIdentificadorPortal: number;
  /** Subastas del Portal distintas, por prefijo: SUB-JA (judicial), SUB-AT... */
  porTipo: Record<string, number>;
  errores: Array<{ contexto: string; mensaje: string }>;
}

/**
 * Ingesta el rango de fechas indicado: descarga el sumario de cada día, filtra
 * las convocatorias de subasta, baja el anuncio íntegro de cada una y lo guarda.
 *
 * Tolerante a fallos por diseño: un día sin boletín (domingos, festivos) o un
 * anuncio que no parsea no deben abortar una ingesta de meses.
 */
export async function ingestarRango(
  desde: Date,
  hasta: Date,
  opciones: { verboso?: boolean } = {},
): Promise<ResumenIngesta> {
  const resumen: ResumenIngesta = {
    diasConsultados: 0,
    diasSinBoletin: 0,
    itemsTotales: 0,
    candidatosInspeccionados: 0,
    anunciosGuardados: 0,
    conReferenciaCatastral: 0,
    conIdentificadorPortal: 0,
    porTipo: {},
    errores: [],
  };

  for (const fecha of rangoDeFechas(desde, hasta)) {
    resumen.diasConsultados++;

    let items: ItemLocalizado[];
    try {
      items = await obtenerSumario(fecha);
    } catch (error) {
      // El BOE devuelve 404 los días sin boletín. Es normal, no es un error.
      const mensaje = error instanceof Error ? error.message : String(error);
      if (mensaje.includes('404')) {
        resumen.diasSinBoletin++;
      } else {
        resumen.errores.push({ contexto: `sumario ${fecha}`, mensaje });
      }
      continue;
    }

    resumen.itemsTotales += items.length;
    const candidatos = filtrarCandidatos(items);
    resumen.candidatosInspeccionados += candidatos.length;

    if (opciones.verboso && candidatos.length > 0) {
      console.log(`  ${fecha}: ${candidatos.length} candidatos de ${items.length} items`);
    }

    for (const { item } of candidatos) {
      try {
        const anuncio = await obtenerAnuncio(item.identificador);
        const idsPortal = extraerIdentificadoresPortal(anuncio.texto);

        // Es subasta si enlaza el Portal, o si el título ya lo dice (subastas
        // que se celebran fuera del Portal: Hacienda en sobre cerrado, AENA...).
        const esSubasta = idsPortal.length > 0 || esConvocatoriaDeSubasta(item.titulo);
        if (!esSubasta) continue;

        const referencias = extraerReferenciasCatastrales(anuncio.texto);

        guardarAnuncio({
          identificador: anuncio.identificador || item.identificador,
          titulo: anuncio.titulo || item.titulo,
          departamento: anuncio.departamento,
          departamentoCodigo: anuncio.departamentoCodigo,
          fechaPublicacion: anuncio.fechaPublicacion ?? fecha,
          seccion: anuncio.seccion,
          subseccion: anuncio.subseccion,
          urlPdf: anuncio.urlPdf ?? item.url_pdf?.texto ?? null,
          urlHtml: item.url_html ?? null,
          urlXml: item.url_xml ?? null,
          texto: anuncio.texto,
          referenciasCatastrales: referencias,
          identificadoresSubasta: idsPortal,
        });

        resumen.anunciosGuardados++;
        if (referencias.length > 0) resumen.conReferenciaCatastral++;
        if (idsPortal.length > 0) resumen.conIdentificadorPortal++;

        for (const id of idsPortal) {
          const tipo = id.slice(0, 6); // SUB-JA, SUB-AT, ...
          resumen.porTipo[tipo] = (resumen.porTipo[tipo] ?? 0) + 1;
        }

        if (opciones.verboso) {
          const etiqueta = idsPortal[0] ?? '(fuera del Portal)';
          console.log(
            `      ${item.identificador}  ${etiqueta.padEnd(26)} refcat=${referencias.length}  ${item.titulo.slice(0, 45)}`,
          );
        }
      } catch (error) {
        resumen.errores.push({
          contexto: item.identificador,
          mensaje: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return resumen;
}

export * from './sumario';
export * from './anuncio';
