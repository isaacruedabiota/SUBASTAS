import { XMLParser } from 'fast-xml-parser';
import { PATRON_IDENTIFICADOR_SUBASTA } from '@subastas/core';
import { fetchTexto } from '../../http';

/**
 * Descarga y parsea el XML íntegro de un anuncio del BOE.
 * https://www.boe.es/diario_boe/xml.php?id=BOE-B-2026-25447
 *
 * Estructura real: documento > (metadatos | analisis | texto).
 * El cuerpo son párrafos <p class="parrafo">, sin ninguna estructura semántica:
 * los importes y las referencias catastrales hay que extraerlos del texto.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false, // los números de expediente pierden ceros si se parsean
  trimValues: true,
});

export interface AnuncioBoe {
  identificador: string;
  titulo: string;
  departamento: string | null;
  departamentoCodigo: string | null;
  fechaPublicacion: string | null;
  seccion: string | null;
  subseccion: string | null;
  urlPdf: string | null;
  parrafos: string[];
  /** Texto plano completo, para búsqueda y para extraer datos por patrón. */
  texto: string;
}

const comoTexto = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text']);
  }
  const s = String(v).trim();
  return s === '' ? null : s;
};

export async function obtenerAnuncio(id: string): Promise<AnuncioBoe> {
  const xml = await fetchTexto(`https://www.boe.es/diario_boe/xml.php?id=${id}`);
  return parsearAnuncio(xml);
}

export function parsearAnuncio(xml: string): AnuncioBoe {
  const raiz = parser.parse(xml) as Record<string, any>;
  const doc = raiz.documento ?? {};
  const meta = doc.metadatos ?? {};

  const parrafosCrudos = doc.texto?.p ?? [];
  const parrafos = (Array.isArray(parrafosCrudos) ? parrafosCrudos : [parrafosCrudos])
    .map((p) => comoTexto(p))
    .filter((p): p is string => p !== null);

  return {
    identificador: comoTexto(meta.identificador) ?? '',
    titulo: comoTexto(meta.titulo) ?? '',
    departamento: comoTexto(meta.departamento),
    departamentoCodigo: comoTexto(meta.departamento?.['@codigo']),
    fechaPublicacion: comoTexto(meta.fecha_publicacion),
    seccion: comoTexto(meta.seccion),
    subseccion: comoTexto(meta.subseccion),
    urlPdf: comoTexto(meta.url_pdf),
    parrafos,
    texto: parrafos.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Extracción de datos del cuerpo del anuncio.
// Es best-effort por definición: cada organismo redacta como quiere.
// ---------------------------------------------------------------------------

/**
 * Referencia catastral: 20 caracteres alfanuméricos. Es la clave de unión con
 * Catastro y, por tanto, lo que habilita todo el enriquecimiento.
 */
export function extraerReferenciasCatastrales(texto: string): string[] {
  const encontradas = new Set<string>();

  // Con etiqueta explícita: "Referencia catastral: 1234567AB1234C0001DE"
  for (const m of texto.matchAll(
    /referencia\s+catastral[:\s]*([0-9A-Z]{20}|[0-9A-Z]{14})/gi,
  )) {
    encontradas.add(m[1]!.toUpperCase());
  }

  // Suelta en el texto: 20 alfanuméricos con al menos una letra y un dígito.
  for (const m of texto.matchAll(/\b(?=[0-9A-Z]{20}\b)(?=.*\d)(?=.*[A-Z])[0-9A-Z]{20}\b/g)) {
    encontradas.add(m[0].toUpperCase());
  }

  return [...encontradas];
}

/** Importes en euros presentes en el texto, en céntimos. */
export function extraerImportes(texto: string): number[] {
  const importes: number[] = [];

  for (const m of texto.matchAll(
    /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*(?:euros?|€)/gi,
  )) {
    const normalizado = m[1]!.replace(/\./g, '').replace(',', '.');
    const valor = Number(normalizado);
    if (Number.isFinite(valor)) importes.push(Math.round(valor * 100));
  }

  return importes;
}

/**
 * Identificadores del Portal de Subastas incrustados en el anuncio.
 *
 * Este es el puente entre el BOE y el Portal, y la razón de que el catálogo
 * completo se pueda construir por la vía oficial. Los anuncios de la AEAT traen
 * literalmente:
 *   Dirección electrónica: https://subastas.boe.es/ds.php?id=SUB-AT-2026-26R4586001001
 *
 * El sufijo es alfanumérico, no numérico.
 */
export function extraerIdentificadoresPortal(texto: string): string[] {
  return [...new Set([...texto.matchAll(PATRON_IDENTIFICADOR_SUBASTA)].map((m) => m[0]))];
}

/** Número de referencia interno del expediente (AEAT): "S2026R4586001001". */
export function extraerReferenciaExpediente(texto: string): string | null {
  const m = texto.match(/n[úu]mero de referencia\s+([A-Z0-9]+)/i);
  return m ? m[1]! : null;
}
