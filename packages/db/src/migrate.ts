import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { abrirBd, cerrarBd, RUTA_BD } from './index';

/**
 * Migraciones: ficheros .sql numerados en packages/db/migrations, aplicados en
 * orden y una sola vez. Sin librería de migraciones: para este tamaño de
 * proyecto, una tabla de control y un bucle son suficientes.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_MIGRACIONES = resolve(AQUI, '../migrations');

function main(): void {
  const db = abrirBd();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migraciones (
      nombre     TEXT PRIMARY KEY,
      aplicada_en TEXT NOT NULL
    )
  `);

  const filas = db.prepare('SELECT nombre FROM _migraciones').all() as Array<{
    nombre: string;
  }>;
  const aplicadas = new Set(filas.map((fila) => fila.nombre));

  const pendientes = readdirSync(DIR_MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !aplicadas.has(f));

  if (pendientes.length === 0) {
    console.log(`Sin migraciones pendientes. BD: ${RUTA_BD}`);
    cerrarBd();
    return;
  }

  const registrar = db.prepare('INSERT INTO _migraciones VALUES (?, ?)');

  for (const nombre of pendientes) {
    const sql = readFileSync(join(DIR_MIGRACIONES, nombre), 'utf8');
    console.log(`Aplicando ${nombre}...`);

    // node:sqlite no permite BEGIN dentro de exec() con múltiples sentencias
    // si el .sql ya trae PRAGMAs, así que se ejecuta tal cual y se registra
    // inmediatamente después.
    db.exec(sql);
    registrar.run(nombre, new Date().toISOString());
  }

  console.log(`${pendientes.length} migración(es) aplicadas. BD: ${RUTA_BD}`);
  cerrarBd();
}

main();
