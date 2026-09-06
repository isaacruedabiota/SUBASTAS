import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Carga el `.env` de la raíz del monorepo.
 *
 * Hace falta porque `tsx` NO lee `.env` por su cuenta: sin esto, poner
 * MAPILLARY_TOKEN en el fichero no servía de nada y el worker seguía diciendo
 * "falta el token". Next.js sí lo carga solo, de ahí que la web no lo notara.
 *
 * `process.loadEnvFile` viene en Node ≥20.12, así que no añade dependencias —
 * misma razón por la que se usa `node:sqlite` en vez de better-sqlite3.
 *
 * Se importa EL PRIMERO en cada script, antes que cualquier módulo que lea
 * process.env al cargarse (http.ts lee el rate limit, db/index lee SUBASTAS_DB).
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const RUTA = process.env.SUBASTAS_ENV ?? join(RAIZ, '.env');

if (existsSync(RUTA)) {
  process.loadEnvFile(RUTA);
}

export const RUTA_ENV = RUTA;
