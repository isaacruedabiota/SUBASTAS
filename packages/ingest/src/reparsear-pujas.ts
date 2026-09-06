import './entorno';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBd } from '@subastas/db';
import { parsearPujas, type SituacionPuja } from './sources/portal-subastas/index';

/**
 * Rellena `estado_puja.situacion` releyendo el HTML que ya está en la caché.
 *
 *   npm run repujas
 *
 * SIN NINGUNA PETICIÓN DE RED, igual que `readjuntos`: recorre
 * data/cache/portal, que son páginas ya descargadas.
 *
 * Hace falta porque hasta ahora solo se guardaba el importe de la puja, y el
 * Portal **no publica el importe mientras la subasta está en curso**: dice si
 * hay pujas o no, pero reserva la cifra a los usuarios registrados. Sin
 * distinguirlo, una subasta que declara tener pujas quedaba igual que una
 * vacía y la ficha mostraba «Sin pujas» — afirmando algo que el Portal no dice.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR_CACHE = process.env.INGEST_CACHE_DIR ?? join(RAIZ, 'data/cache/portal');

function main(): void {
  if (!existsSync(DIR_CACHE)) {
    console.log(`No hay caché en ${DIR_CACHE}.`);
    return;
  }

  /* Una subasta puede tener la pestaña cacheada en varios días. Se recorre por
     día ascendente para que la lectura más reciente sea la que quede. */
  const porSubasta = new Map<string, SituacionPuja>();
  let paginas = 0;

  for (const dia of readdirSync(DIR_CACHE).sort()) {
    const carpeta = join(DIR_CACHE, dia);
    for (const fichero of readdirSync(carpeta)) {
      const html = readFileSync(join(carpeta, fichero), 'utf8');
      // Filtro barato antes de montar cheerio: la etiqueta solo existe en ver=5.
      if (!html.includes('de la subasta')) continue;

      const id = /idSub=(SUB-[A-Z]{2}-\d{4}-[A-Z0-9]+)/.exec(html)?.[1];
      if (!id) continue;

      const { situacionPuja } = parsearPujas(html);
      if (situacionPuja === null) continue;

      paginas++;
      porSubasta.set(id, situacionPuja);
    }
  }

  const db = abrirBd();
  const conocidas = db
    .prepare('SELECT identificador FROM subastas')
    .all() as Array<{ identificador: string }>;
  const enBd = new Set(conocidas.map((s) => s.identificador));

  const actualizar = db.prepare(
    `UPDATE estado_puja SET situacion = ?
      WHERE subasta_id = ? AND situacion IS NULL`,
  );
  /* Las que declaran pujas sin cifra no llegaron a tener fila: la escritura
     antigua solo insertaba si había importe o texto. */
  const insertar = db.prepare(
    `INSERT INTO estado_puja (subasta_id, puja_maxima, situacion, capturado_en)
     SELECT ?, NULL, ?, COALESCE(portal_leido_en, ?)
       FROM subastas
      WHERE identificador = ?
        AND NOT EXISTS (SELECT 1 FROM estado_puja WHERE subasta_id = ?)`,
  );

  const ahora = new Date().toISOString();
  const cuenta: Record<string, number> = {};
  let actualizadas = 0;
  let nuevas = 0;
  let huerfanas = 0;

  for (const [id, situacion] of porSubasta) {
    cuenta[situacion] = (cuenta[situacion] ?? 0) + 1;

    if (!enBd.has(id)) {
      huerfanas++; // pestaña cacheada de una ficha que nunca se llegó a guardar
      continue;
    }

    actualizadas += actualizar.run(situacion, id).changes as number;
    nuevas += insertar.run(id, situacion, ahora, id, id).changes as number;
  }

  console.log(`Reparseo de pujas desde la caché (sin red)

  Pestañas de pujas leídas : ${paginas}
  Subastas distintas       : ${porSubasta.size}
  Sin ficha en la BD       : ${huerfanas}

  Filas actualizadas       : ${actualizadas}
  Filas nuevas             : ${nuevas}
`);

  console.table(
    Object.entries(cuenta)
      .sort((a, b) => b[1] - a[1])
      .map(([situacion, n]) => ({ situacion, subastas: n })),
  );
}

main();
