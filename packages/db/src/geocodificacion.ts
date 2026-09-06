import type { PuntoGeocodificado } from '@subastas/core';
import { abrirBd } from './index';

/**
 * Coordenadas deducidas de la dirección. Ver migración 008 para por qué van
 * separadas de las de Catastro.
 */

export interface PendienteGeocodificar {
  inmuebleId: number;
  direccion: string;
  localidad: string | null;
  provincia: string | null;
}

/**
 * Inmuebles con dirección y sin coordenadas de Catastro que aún no se han
 * intentado geocodificar (o fallaron menos de 3 veces).
 */
export function pendientesDeGeocodificar(limite = 100): PendienteGeocodificar[] {
  return abrirBd()
    .prepare(
      `SELECT i.id AS inmuebleId, i.direccion, i.localidad, i.provincia
         FROM inmuebles i
         LEFT JOIN catastro c ON c.referencia_catastral = i.referencia_catastral
         LEFT JOIN geocodificacion g ON g.inmueble_id = i.id
        WHERE i.direccion IS NOT NULL AND length(i.direccion) >= 6
          AND c.lat IS NULL
          AND (g.inmueble_id IS NULL OR (g.lat IS NULL AND g.intentos < 3))
        ORDER BY i.id
        LIMIT ?`,
    )
    .all(limite) as unknown as PendienteGeocodificar[];
}

export function guardarGeocodificacion(
  inmuebleId: number,
  punto: PuntoGeocodificado,
  consulta: string,
): void {
  abrirBd()
    .prepare(
      `INSERT INTO geocodificacion
         (inmueble_id, lat, lon, precision, consulta, direccion_normalizada, consultado_en, intentos)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(inmueble_id) DO UPDATE SET
         lat = excluded.lat, lon = excluded.lon,
         precision = excluded.precision, consulta = excluded.consulta,
         direccion_normalizada = excluded.direccion_normalizada,
         consultado_en = excluded.consultado_en, error = NULL`,
    )
    .run(
      inmuebleId,
      punto.lat,
      punto.lon,
      punto.precision,
      consulta,
      punto.direccionNormalizada,
      new Date().toISOString(),
    );
}

/** Se intentó y no salió: se anota para no repetirlo indefinidamente. */
export function anotarFalloGeocodificacion(
  inmuebleId: number,
  consulta: string | null,
  error: string,
): void {
  abrirBd()
    .prepare(
      `INSERT INTO geocodificacion (inmueble_id, consulta, consultado_en, intentos, error)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(inmueble_id) DO UPDATE SET
         intentos = geocodificacion.intentos + 1,
         error = excluded.error,
         consulta = excluded.consulta,
         consultado_en = excluded.consultado_en`,
    )
    .run(inmuebleId, consulta, new Date().toISOString(), error.slice(0, 200));
}

export function estadoGeocodificacion(): {
  conDireccionSinCatastro: number;
  resueltas: number;
  fallidas: number;
  pendientes: number;
} {
  const db = abrirBd();
  const n = (sql: string) => (db.prepare(sql).get() as { c: number }).c;

  const total = n(
    `SELECT COUNT(*) c FROM inmuebles i
       LEFT JOIN catastro c ON c.referencia_catastral = i.referencia_catastral
      WHERE i.direccion IS NOT NULL AND length(i.direccion) >= 6 AND c.lat IS NULL`,
  );
  const resueltas = n('SELECT COUNT(*) c FROM geocodificacion WHERE lat IS NOT NULL');
  const fallidas = n('SELECT COUNT(*) c FROM geocodificacion WHERE lat IS NULL');

  return {
    conDireccionSinCatastro: total,
    resueltas,
    fallidas,
    pendientes: total - resueltas - fallidas,
  };
}
