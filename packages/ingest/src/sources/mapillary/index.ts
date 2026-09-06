import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fotoMasCercana, type FotoCalle } from '@subastas/core';
import { fetchBinario, fetchTexto } from '../../http';

/**
 * Cliente de Mapillary v4. Ver packages/core/src/schemas/mapillary.ts para las
 * particularidades de la API.
 *
 * El token se pide en https://www.mapillary.com/dashboard/developers — es
 * gratuito y no exige cuenta de facturación, a diferencia de Google.
 */

const GRAPH = 'https://graph.mapillary.com/images';
const CAMPOS = 'id,thumb_1024_url,thumb_2048_url,captured_at,compass_angle,geometry,creator,is_pano';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const DIR_IMAGENES = process.env.INGEST_DIR_CALLES ?? join(RAIZ, 'data/calle');

/** Radio de búsqueda en metros. La API topa el bbox en 0,01 grados de lado. */
const RADIO_M = Number(process.env.MAPILLARY_RADIO_M ?? 150);

export function hayToken(): boolean {
  return Boolean(process.env.MAPILLARY_TOKEN);
}

/** Caja de búsqueda alrededor del punto, en grados. */
function bbox(lat: number, lon: number, metros: number): string {
  const dLat = metros / 111_320;
  const dLon = metros / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
  // Tope duro de la API: el lado debe medir menos de 0,01 grados.
  const cLat = Math.min(dLat, 0.0049);
  const cLon = Math.min(dLon, 0.0049);
  return [lon - cLon, lat - cLat, lon + cLon, lat + cLat]
    .map((n) => n.toFixed(6))
    .join(',');
}

/** La foto de calle más cercana a un punto, o null si no hay cobertura. */
export async function buscarFotoCalle(
  lat: number,
  lon: number,
): Promise<FotoCalle | null> {
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) throw new Error('Falta MAPILLARY_TOKEN');

  const url =
    `${GRAPH}?access_token=${encodeURIComponent(token)}` +
    `&fields=${CAMPOS}&limit=50&bbox=${bbox(lat, lon, RADIO_M)}`;

  const texto = await fetchTexto(url, { headers: { Accept: 'application/json' } });
  return fotoMasCercana(JSON.parse(texto) as unknown, lat, lon);
}

/**
 * Descarga la foto a data/calle/ y devuelve la ruta relativa.
 * Se nombra por referencia catastral: una foto por inmueble, sin duplicados.
 */
export async function descargarFoto(
  referenciaCatastral: string,
  foto: FotoCalle,
): Promise<string> {
  const { datos, tipo } = await fetchBinario(foto.url);
  const ext = tipo.includes('png') ? 'png' : 'jpg';
  const nombre = `${referenciaCatastral.toUpperCase()}.${ext}`;

  mkdirSync(DIR_IMAGENES, { recursive: true });
  writeFileSync(join(DIR_IMAGENES, nombre), datos);

  return nombre;
}

export { DIR_IMAGENES };
