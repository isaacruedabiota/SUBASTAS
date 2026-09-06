import type { FichaCatastro } from '@subastas/core';
import { abrirBd } from './index';

/**
 * Caché persistente de Catastro. La consulta al OVC es gratuita pero lenta y
 * conviene no repetirla: un mismo inmueble puede salir a subasta varias veces.
 */

export function guardarFichaCatastro(ficha: FichaCatastro, crudo: unknown): void {
  abrirBd()
    .prepare(
      `INSERT INTO catastro (
         referencia_catastral, superficie_construida, superficie_suelo,
         anio_construccion, uso_principal, localizacion, lat, lon,
         consultado_en, respuesta_cruda, clase, provincia, municipio,
         direccion_completa, tipo_finca, url_plano, error
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
       ON CONFLICT(referencia_catastral) DO UPDATE SET
         superficie_construida = excluded.superficie_construida,
         superficie_suelo      = excluded.superficie_suelo,
         anio_construccion     = excluded.anio_construccion,
         uso_principal         = excluded.uso_principal,
         lat                   = excluded.lat,
         lon                   = excluded.lon,
         consultado_en         = excluded.consultado_en,
         respuesta_cruda       = excluded.respuesta_cruda,
         clase                 = excluded.clase,
         provincia             = excluded.provincia,
         municipio             = excluded.municipio,
         direccion_completa    = excluded.direccion_completa,
         tipo_finca            = excluded.tipo_finca,
         url_plano             = excluded.url_plano,
         error                 = NULL`,
    )
    .run(
      ficha.referenciaCatastral,
      ficha.superficieConstruidaM2,
      ficha.superficieSueloM2,
      ficha.anioConstruccion,
      ficha.usoPrincipal,
      ficha.direccionCompleta,
      ficha.lat,
      ficha.lon,
      ficha.consultadoEn,
      JSON.stringify(crudo),
      ficha.clase,
      ficha.provincia,
      ficha.municipio,
      ficha.direccionCompleta,
      ficha.tipoFinca,
      ficha.urlPlano,
    );
}

/** Se registra también el fallo, para no reintentar en bucle una RC inválida. */
export function guardarErrorCatastro(referenciaCatastral: string, error: string): void {
  abrirBd()
    .prepare(
      `INSERT INTO catastro (referencia_catastral, consultado_en, error)
       VALUES (?,?,?)
       ON CONFLICT(referencia_catastral) DO UPDATE SET
         consultado_en = excluded.consultado_en,
         error         = excluded.error`,
    )
    .run(referenciaCatastral, new Date().toISOString(), error);
}

/** Referencias vistas en anuncios que aún no se han consultado al OVC. */
export function referenciasPendientes(limite = 100): string[] {
  const filas = abrirBd()
    .prepare(
      `SELECT DISTINCT r.referencia_catastral AS rc
       FROM anuncio_referencias r
       LEFT JOIN catastro c ON c.referencia_catastral = r.referencia_catastral
       WHERE c.referencia_catastral IS NULL
       LIMIT ?`,
    )
    .all(limite) as Array<{ rc: string }>;

  return filas.map((f) => f.rc);
}

export function contarCatastro(): { total: number; conError: number } {
  const f = abrirBd()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS conError
       FROM catastro`,
    )
    .get() as { total: number; conError: number | null };

  return { total: f.total, conError: f.conError ?? 0 };
}
