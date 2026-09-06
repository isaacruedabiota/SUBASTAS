import type { FotoCalle } from '@subastas/core';
import { abrirBd } from './index';

/**
 * Acceso a `imagen_calle`: la foto de calle guardada de cada inmueble.
 *
 * Solo Mapillary llega hasta aquí. Street View se sirve en vivo desde la web
 * porque sus términos no permiten almacenarlo; ver migración 006.
 */

export interface ImagenCalle {
  referenciaCatastral: string;
  ruta: string;
  urlOrigen: string | null;
  rumbo: number | null;
  distanciaM: number | null;
  capturadaEn: string | null;
  autor: string | null;
  licencia: string | null;
}

/** Referencias con coordenadas que todavía no se han mirado en Mapillary. */
export function pendientesDeFoto(limite = 200): Array<{
  referenciaCatastral: string;
  lat: number;
  lon: number;
}> {
  return abrirBd()
    .prepare(
      `SELECT c.referencia_catastral AS referenciaCatastral, c.lat, c.lon
         FROM catastro c
         LEFT JOIN imagen_calle ic
                ON ic.referencia_catastral = c.referencia_catastral
        WHERE c.lat IS NOT NULL AND c.lon IS NOT NULL
          AND (ic.referencia_catastral IS NULL OR (ic.ruta IS NULL AND ic.intentos < 3))
        ORDER BY c.referencia_catastral
        LIMIT ?`,
    )
    .all(limite) as Array<{ referenciaCatastral: string; lat: number; lon: number }>;
}

export function guardarFoto(
  referenciaCatastral: string,
  foto: FotoCalle,
  ruta: string,
): void {
  abrirBd()
    .prepare(
      `INSERT INTO imagen_calle
         (referencia_catastral, sin_cobertura, imagen_id, ruta, url_origen,
          lat, lon, rumbo, distancia_m, capturada_en, autor, licencia,
          consultada_en, intentos)
       VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(referencia_catastral) DO UPDATE SET
         sin_cobertura = 0,
         imagen_id     = excluded.imagen_id,
         ruta          = excluded.ruta,
         url_origen    = excluded.url_origen,
         lat           = excluded.lat,
         lon           = excluded.lon,
         rumbo         = excluded.rumbo,
         distancia_m   = excluded.distancia_m,
         capturada_en  = excluded.capturada_en,
         autor         = excluded.autor,
         licencia      = excluded.licencia,
         consultada_en = excluded.consultada_en,
         ultimo_error  = NULL`,
    )
    .run(
      referenciaCatastral,
      foto.imagenId,
      ruta,
      foto.url,
      foto.lat,
      foto.lon,
      foto.rumbo,
      foto.distanciaM,
      foto.capturadaEn,
      foto.autor,
      foto.licencia,
      new Date().toISOString(),
    );
}

/** Se miró y no había nada cerca: se anota para no repetir la consulta. */
export function marcarSinCobertura(referenciaCatastral: string): void {
  abrirBd()
    .prepare(
      `INSERT INTO imagen_calle (referencia_catastral, sin_cobertura, consultada_en, intentos)
       VALUES (?, 1, ?, 0)
       ON CONFLICT(referencia_catastral) DO UPDATE SET
         sin_cobertura = 1, consultada_en = excluded.consultada_en, ultimo_error = NULL`,
    )
    .run(referenciaCatastral, new Date().toISOString());
}

export function anotarFallo(referenciaCatastral: string, error: string): void {
  abrirBd()
    .prepare(
      `INSERT INTO imagen_calle (referencia_catastral, consultada_en, intentos, ultimo_error)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(referencia_catastral) DO UPDATE SET
         intentos      = imagen_calle.intentos + 1,
         ultimo_error  = excluded.ultimo_error,
         consultada_en = excluded.consultada_en`,
    )
    .run(referenciaCatastral, new Date().toISOString(), error.slice(0, 300));
}

/** La foto guardada de una referencia catastral, si la hay. */
export function fotoDe(referenciaCatastral: string): ImagenCalle | null {
  const f = abrirBd()
    .prepare(
      `SELECT referencia_catastral AS referenciaCatastral, ruta,
              url_origen AS urlOrigen, rumbo, distancia_m AS distanciaM,
              capturada_en AS capturadaEn, autor, licencia
         FROM imagen_calle
        WHERE referencia_catastral = ? AND ruta IS NOT NULL`,
    )
    .get(referenciaCatastral) as ImagenCalle | undefined;

  return f ?? null;
}

export function estadoCalles(): {
  conCoordenadas: number;
  conFoto: number;
  sinCobertura: number;
  pendientes: number;
} {
  const db = abrirBd();
  const n = (sql: string) => (db.prepare(sql).get() as { c: number }).c;

  const conCoordenadas = n('SELECT COUNT(*) c FROM catastro WHERE lat IS NOT NULL');
  const conFoto = n('SELECT COUNT(*) c FROM imagen_calle WHERE ruta IS NOT NULL');
  const sinCobertura = n('SELECT COUNT(*) c FROM imagen_calle WHERE sin_cobertura = 1');

  return {
    conCoordenadas,
    conFoto,
    sinCobertura,
    pendientes: conCoordenadas - conFoto - sinCobertura,
  };
}
