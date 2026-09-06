import type { AdjuntoPortal } from '@subastas/core';
import { abrirBd } from './index';

/**
 * Fotos y documentos que el Portal publica en la pestaña de bienes.
 * Ver migración 007 para el porqué de la tabla.
 */

export interface AdjuntoGuardado {
  docId: string;
  tipo: string;
  titulo: string;
  ruta: string | null;
}

/** Los metadatos vienen del HTML de la ficha: no cuestan ninguna petición. */
export function guardarAdjuntos(subastaId: string, adjuntos: AdjuntoPortal[]): void {
  if (adjuntos.length === 0) return;

  const db = abrirBd();
  const ahora = new Date().toISOString();

  const stmt = db.prepare(
    `INSERT INTO adjunto_subasta (subasta_id, doc_id, tipo, titulo, orden, visto_en)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(subasta_id, doc_id) DO UPDATE SET
       titulo   = excluded.titulo,
       tipo     = excluded.tipo,
       orden    = excluded.orden,
       visto_en = excluded.visto_en`,
  );

  adjuntos.forEach((a, i) => {
    stmt.run(subastaId, a.docId, a.tipo, a.titulo, i, ahora);
  });
}

/** Fotos que faltan por descargar, más recientes primero. */
export function fotosPendientes(limite = 100): Array<{
  subastaId: string;
  docId: string;
  titulo: string;
}> {
  return abrirBd()
    .prepare(
      `SELECT a.subasta_id AS subastaId, a.doc_id AS docId, a.titulo
         FROM adjunto_subasta a
         LEFT JOIN subastas s ON s.identificador = a.subasta_id
        WHERE a.tipo = 'FOTO' AND a.ruta IS NULL AND a.intentos < 3
        ORDER BY s.fecha_conclusion DESC, a.subasta_id, a.orden
        LIMIT ?`,
    )
    .all(limite) as Array<{ subastaId: string; docId: string; titulo: string }>;
}

/** Fotos que le faltan a UNA subasta. Lo que pide la web al abrir la ficha. */
export function fotosPendientesDe(subastaId: string): Array<{
  docId: string;
  titulo: string;
}> {
  return abrirBd()
    .prepare(
      `SELECT doc_id AS docId, titulo
         FROM adjunto_subasta
        WHERE subasta_id = ? AND tipo = 'FOTO' AND ruta IS NULL AND intentos < 3
        ORDER BY orden`,
    )
    .all(subastaId) as unknown as Array<{ docId: string; titulo: string }>;
}

export function marcarFotoDescargada(
  subastaId: string,
  docId: string,
  ruta: string,
): void {
  abrirBd()
    .prepare(
      `UPDATE adjunto_subasta
          SET ruta = ?, descargada_en = ?, ultimo_error = NULL
        WHERE subasta_id = ? AND doc_id = ?`,
    )
    .run(ruta, new Date().toISOString(), subastaId, docId);
}

export function anotarFalloFoto(
  subastaId: string,
  docId: string,
  error: string,
): void {
  abrirBd()
    .prepare(
      `UPDATE adjunto_subasta
          SET intentos = intentos + 1, ultimo_error = ?
        WHERE subasta_id = ? AND doc_id = ?`,
    )
    .run(error.slice(0, 300), subastaId, docId);
}

/** Adjuntos de una subasta, fotos primero. */
export function adjuntosDe(subastaId: string): AdjuntoGuardado[] {
  return abrirBd()
    .prepare(
      `SELECT doc_id AS docId, tipo, titulo, ruta
         FROM adjunto_subasta
        WHERE subasta_id = ?
        ORDER BY CASE tipo WHEN 'FOTO' THEN 0 ELSE 1 END, orden`,
    )
    .all(subastaId) as unknown as AdjuntoGuardado[];
}

export function estadoAdjuntos(): {
  subastasConFotos: number;
  fotos: number;
  fotosDescargadas: number;
  documentos: number;
} {
  const db = abrirBd();
  const n = (sql: string) => (db.prepare(sql).get() as { c: number }).c;

  return {
    subastasConFotos: n(
      "SELECT COUNT(DISTINCT subasta_id) c FROM adjunto_subasta WHERE tipo = 'FOTO'",
    ),
    fotos: n("SELECT COUNT(*) c FROM adjunto_subasta WHERE tipo = 'FOTO'"),
    fotosDescargadas: n(
      "SELECT COUNT(*) c FROM adjunto_subasta WHERE tipo = 'FOTO' AND ruta IS NOT NULL",
    ),
    documentos: n("SELECT COUNT(*) c FROM adjunto_subasta WHERE tipo = 'DOCUMENTO'"),
  };
}
