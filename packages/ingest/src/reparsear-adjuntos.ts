import './entorno';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardarAdjuntos, estadoAdjuntos } from '@subastas/db/adjuntos';
import { parsearAdjuntos } from './sources/portal-subastas/index';

/**
 * Rellena `adjunto_subasta` releyendo el HTML que ya está en la caché.
 *
 *   npm run readjuntos
 *
 * SIN NINGUNA PETICIÓN DE RED: recorre data/cache/portal, que son páginas ya
 * descargadas. Sirve para las fichas leídas antes de que existiera el parser de
 * adjuntos; las que se lean a partir de ahora los guardan solas.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR_CACHE = process.env.INGEST_CACHE_DIR ?? join(RAIZ, 'data/cache/portal');

function main(): void {
  if (!existsSync(DIR_CACHE)) {
    console.log(`No hay caché en ${DIR_CACHE}.`);
    return;
  }

  /* Un mismo idSub aparece en varias páginas (una por lote), así que se
     acumulan por subasta antes de guardar. */
  const porSubasta = new Map<
    string,
    Map<string, { docId: string; titulo: string; tipo: 'FOTO' | 'DOCUMENTO' }>
  >();

  let paginas = 0;

  for (const dia of readdirSync(DIR_CACHE)) {
    const carpeta = join(DIR_CACHE, dia);
    for (const fichero of readdirSync(carpeta)) {
      const html = readFileSync(join(carpeta, fichero), 'utf8');
      if (!html.includes('verThumbnail') && !html.includes('puntoPDF')) continue;

      const id = /idSub=(SUB-[A-Z]{2}-\d{4}-[A-Z0-9]+)/.exec(html)?.[1];
      if (!id) continue;

      paginas++;
      const { fotos, documentos } = parsearAdjuntos(html);
      if (fotos.length === 0 && documentos.length === 0) continue;

      const acum = porSubasta.get(id) ?? new Map();
      for (const f of fotos) if (!acum.has(f.docId)) acum.set(f.docId, { ...f, tipo: 'FOTO' });
      for (const d of documentos)
        if (!acum.has(d.docId)) acum.set(d.docId, { ...d, tipo: 'DOCUMENTO' });
      porSubasta.set(id, acum);
    }
  }

  console.log(`Reparseo de adjuntos desde la caché (sin red)
  Páginas revisadas : ${paginas}
  Subastas con algo : ${porSubasta.size}`);

  for (const [id, adjuntos] of porSubasta) {
    guardarAdjuntos(id, [...adjuntos.values()]);
  }

  const e = estadoAdjuntos();
  console.log(`
  Subastas con fotos: ${e.subastasConFotos}
  Fotos catalogadas : ${e.fotos}
  Documentos        : ${e.documentos}

Ahora "npm run fotos" descarga las imágenes.`);
}

main();
