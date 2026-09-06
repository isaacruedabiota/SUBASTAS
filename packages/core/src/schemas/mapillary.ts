import { z } from 'zod';

/**
 * Mapillary API v4 — fotos de calle colaborativas.
 *
 *   https://graph.mapillary.com/images?access_token=<TOKEN>&fields=...&bbox=...
 *
 * Es la única fuente de vista de calle cuyas imágenes se pueden **guardar**:
 * son CC-BY-SA 4.0, así que basta con citar al autor. Street View no se puede
 * almacenar, por eso aquella va en vivo y esta a disco.
 *
 * Dos detalles de la API que condicionan el cliente:
 *  - La búsqueda por `radius` está topada en 50 m, muy poco para caer cerca de
 *    una parcela cuyo centroide puede estar en mitad de la manzana. Se usa
 *    `bbox`, que llega más lejos, y se ordena por distancia a mano.
 *  - `bbox` debe medir menos de 0,01 grados de lado; el cliente no lo supera.
 */

/** Los campos se piden explícitamente, así que todos llegan como opcionales. */
export const ImagenMapillary = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    thumb_1024_url: z.string().optional(),
    thumb_2048_url: z.string().optional(),
    captured_at: z.number().optional(), // epoch en milisegundos
    compass_angle: z.number().optional(),
    is_pano: z.boolean().optional(),
    geometry: z
      .object({
        // GeoJSON: primero la longitud. Invertirlo sale caro de depurar.
        coordinates: z.tuple([z.number(), z.number()]),
      })
      .optional(),
    creator: z
      .object({
        id: z.union([z.string(), z.number()]).transform(String).optional(),
        username: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export const RespuestaMapillary = z.object({
  data: z.array(ImagenMapillary).default([]),
});

export type ImagenMapillary = z.infer<typeof ImagenMapillary>;

/** Foto ya normalizada y lista para guardar. */
export interface FotoCalle {
  imagenId: string;
  url: string;
  lat: number;
  lon: number;
  rumbo: number | null;
  capturadaEn: string | null;
  autor: string | null;
  licencia: string;
  distanciaM: number;
}

export const LICENCIA_MAPILLARY = 'CC BY-SA 4.0 · Mapillary';

/** Distancia en metros entre dos puntos (haversine). */
export function distanciaMetros(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * De la respuesta cruda a la foto más cercana al inmueble.
 * Devuelve null si ninguna trae miniatura o coordenadas utilizables.
 */
export function fotoMasCercana(
  crudo: unknown,
  lat: number,
  lon: number,
): FotoCalle | null {
  const parseada = RespuestaMapillary.safeParse(crudo);
  if (!parseada.success) return null;

  const candidatas: FotoCalle[] = [];

  for (const img of parseada.data.data) {
    const url = img.thumb_2048_url ?? img.thumb_1024_url;
    const coords = img.geometry?.coordinates;
    if (!url || !coords) continue;

    const [imgLon, imgLat] = coords;
    candidatas.push({
      imagenId: img.id,
      url,
      lat: imgLat,
      lon: imgLon,
      rumbo: img.compass_angle ?? null,
      capturadaEn: img.captured_at
        ? new Date(img.captured_at).toISOString()
        : null,
      autor: img.creator?.username ?? null,
      licencia: LICENCIA_MAPILLARY,
      distanciaM: distanciaMetros(lat, lon, imgLat, imgLon),
    });
  }

  if (candidatas.length === 0) return null;

  candidatas.sort((a, b) => a.distanciaM - b.distanciaM);
  return candidatas[0]!;
}
