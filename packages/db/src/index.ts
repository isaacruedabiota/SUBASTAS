import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

/**
 * SQLite integrado en Node (>=22). No hay dependencias nativas que compilar.
 *
 * Firestore/Typesense/BigQuery quedaron descartados: para un uso personal de un
 * solo usuario, SQLite cubre los filtros multi-rango, el texto completo (FTS5)
 * y los agregados del histórico sin ninguna infraestructura.
 */

/**
 * Se ancla a la raíz del monorepo (packages/db/src -> ../../..), no a cwd:
 * si no, la BD acaba en un sitio distinto según desde dónde se lance el script.
 */
const RAIZ_MONOREPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export const RUTA_BD =
  process.env.SUBASTAS_DB ?? resolve(RAIZ_MONOREPO, 'data/subastas.db');

let instancia: DatabaseSync | null = null;

export function abrirBd(ruta: string = RUTA_BD): DatabaseSync {
  if (instancia) return instancia;

  mkdirSync(dirname(ruta), { recursive: true });

  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  // La ingesta escribe en lotes grandes; NORMAL basta y es mucho más rápido.
  db.exec('PRAGMA synchronous = NORMAL');

  registrarFunciones(db);

  instancia = db;
  return db;
}

/**
 * Funciones SQL propias.
 *
 * `sin_tildes(x)` normaliza para comparar: mayúsculas y sin diacríticos.
 * Hace falta porque el Portal escribe la misma población de varias formas
 * —`MALAGA`, `MÁLAGA` y `Málaga` son tres valores distintos en `inmuebles`— y
 * sin normalizar, filtrar por población devuelve solo un trozo de lo que hay.
 *
 * En SQL puro no se puede: `UPPER()` de SQLite es ASCII y deja la tilde
 * intacta, así que la alternativa era encadenar catorce `REPLACE`. `NFD` +
 * quitar el rango de combinantes es exacto y se lee.
 */
function registrarFunciones(db: DatabaseSync): void {
  db.function('sin_tildes', (valor: unknown): string | null => {
    if (typeof valor !== 'string') return null;
    return valor
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .trim();
  });
}

export function cerrarBd(): void {
  instancia?.close();
  instancia = null;
}

export type { DatabaseSync };
