import {
  errorDeCatastro,
  normalizarCatastro,
  type FichaCatastro,
} from '@subastas/core';
import { fetchTexto } from '../../http';

/**
 * Cliente de los servicios libres del Catastro (OVC). Gratuitos y sin clave.
 * Ver packages/core/src/schemas/catastro.ts para las trampas de la API.
 */

const CALLEJERO =
  'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json';
const COORDENADAS =
  'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx';

export interface ResultadoCatastro {
  ficha: FichaCatastro | null;
  error: string | null;
  crudo: unknown;
}

/** Datos no protegidos de un inmueble por su referencia catastral. */
export async function consultarReferencia(
  referenciaCatastral: string,
): Promise<ResultadoCatastro> {
  const rc = referenciaCatastral.trim().toUpperCase();

  const texto = await fetchTexto(
    // OJO: el parámetro es RefCat, no RC. Con RC devuelve 200 y error 17.
    `${CALLEJERO}/Consulta_DNPRC?Provincia=&Municipio=&RefCat=${encodeURIComponent(rc)}`,
    { headers: { Accept: 'application/json' } },
  );

  const crudo: unknown = JSON.parse(texto);
  const error = errorDeCatastro(crudo);
  const ficha = error ? null : normalizarCatastro(rc, crudo);

  return { ficha, error, crudo };
}

/**
 * Coordenadas del centroide de la parcela, en EPSG:4326.
 * Servicio distinto (XML) y admite solo la referencia de 14 posiciones.
 */
export async function consultarCoordenadas(
  referenciaCatastral: string,
): Promise<{ lat: number; lon: number } | null> {
  const rc14 = referenciaCatastral.trim().toUpperCase().slice(0, 14);
  if (rc14.length < 14) return null;

  const xml = await fetchTexto(
    `${COORDENADAS}/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG%3A4326&RC=${encodeURIComponent(rc14)}`,
  );

  // Respuesta pequeña y de forma fija; no merece un parser de XML completo.
  const lon = xml.match(/<xcen>([-\d.]+)<\/xcen>/)?.[1];
  const lat = xml.match(/<ycen>([-\d.]+)<\/ycen>/)?.[1];
  if (!lon || !lat) return null;

  const n = { lat: Number(lat), lon: Number(lon) };
  return Number.isFinite(n.lat) && Number.isFinite(n.lon) ? n : null;
}

/** Ficha completa: datos del inmueble más coordenadas. */
export async function consultarFichaCompleta(
  referenciaCatastral: string,
): Promise<ResultadoCatastro> {
  const resultado = await consultarReferencia(referenciaCatastral);
  if (!resultado.ficha) return resultado;

  try {
    const coords = await consultarCoordenadas(referenciaCatastral);
    if (coords) {
      resultado.ficha.lat = coords.lat;
      resultado.ficha.lon = coords.lon;
    }
  } catch {
    // Las coordenadas son un extra: que fallen no invalida la ficha.
  }

  return resultado;
}
