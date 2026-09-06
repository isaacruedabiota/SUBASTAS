import './entorno';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBd } from '@subastas/db';
import { parsearDatosSubasta } from './sources/portal-subastas/index';

/**
 * Rellena `puja_minima_situacion` releyendo el HTML ya cacheado.
 *
 *   npm run reminimas
 *
 * SIN NINGUNA PETICIÓN DE RED, igual que `readjuntos` y `repujas`.
 *
 * Hace falta porque una puja mínima vacía confundía dos cosas opuestas: que el
 * Portal diga «Sin puja mínima» —o sea, que NO hay suelo y se admite cualquier
 * puja— y que el dato no se haya leído. La ficha ponía «No consta» en las 983
 * subastas del primer caso, que es justo lo contrario de lo que dicen.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR_CACHE = process.env.INGEST_CACHE_DIR ?? join(RAIZ, 'data/cache/portal');

function main(): void {
  if (!existsSync(DIR_CACHE)) {
    console.log(`No hay caché en ${DIR_CACHE}.`);
    return;
  }

  const porSubasta = new Map<string, string>();
  let paginas = 0;

  // Por día ascendente: la lectura más reciente es la que queda.
  for (const dia of readdirSync(DIR_CACHE).sort()) {
    for (const fichero of readdirSync(join(DIR_CACHE, dia))) {
      const html = readFileSync(join(DIR_CACHE, dia, fichero), 'utf8');
      // Filtro barato: la etiqueta solo está en la pestaña de datos (ver=1).
      if (!html.includes('Valor subasta')) continue;

      const datos = parsearDatosSubasta(html);
      if (!datos.identificador || datos.situacionPujaMinima === null) continue;

      paginas++;
      porSubasta.set(datos.identificador, datos.situacionPujaMinima);
    }
  }

  const db = abrirBd();
  const actualizar = db.prepare(
    `UPDATE subastas SET puja_minima_situacion = ?
      WHERE identificador = ? AND puja_minima_situacion IS NULL`,
  );

  const cuenta: Record<string, number> = {};
  let cambiadas = 0;

  for (const [id, situacion] of porSubasta) {
    cuenta[situacion] = (cuenta[situacion] ?? 0) + 1;
    cambiadas += actualizar.run(situacion, id).changes as number;
  }

  console.log(`Reparseo de la puja mínima desde la caché (sin red)

  Pestañas de datos leídas : ${paginas}
  Subastas distintas       : ${porSubasta.size}
  Filas actualizadas       : ${cambiadas}
`);

  console.table(
    Object.entries(cuenta)
      .sort((a, b) => b[1] - a[1])
      .map(([situacion, n]) => ({ situacion, subastas: n })),
  );
}

main();
