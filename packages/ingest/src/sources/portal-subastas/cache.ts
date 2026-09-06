import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Caché en disco de las respuestas del Portal, con vigencia de un día.
 *
 * Es una de las condiciones que nos impusimos: no repetir una petición ya hecha
 * hoy. Además hace que el desarrollo del parser no genere tráfico: se trabaja
 * sobre el HTML ya guardado.
 *
 * ⚠️ Un día es demasiado para la pestaña de pujas cuando hay sesión iniciada: el
 * importe cambia mientras la subasta está viva, y una página guardada antes de
 * configurar las credenciales taparía el dato el resto del día. Por eso
 * `leerCache` acepta una vigencia más corta.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const DIR_CACHE = process.env.INGEST_CACHE_DIR ?? join(RAIZ, 'data/cache/portal');

const hoy = (): string => new Date().toISOString().slice(0, 10);

function rutaDe(clave: string): string {
  const hash = createHash('sha1').update(clave).digest('hex').slice(0, 16);
  return join(DIR_CACHE, hoy(), `${hash}.html`);
}

/**
 * @param vigenciaMs Si se indica, la entrada caduca a los N ms de escribirse.
 *                   Sin él vale todo el día, que es el comportamiento normal.
 */
export function leerCache(clave: string, vigenciaMs?: number): string | null {
  const ruta = rutaDe(clave);
  if (!existsSync(ruta)) return null;

  if (vigenciaMs !== undefined && Date.now() - statSync(ruta).mtimeMs > vigenciaMs) {
    return null;
  }

  return readFileSync(ruta, 'utf8');
}

export function escribirCache(clave: string, contenido: string): void {
  const ruta = rutaDe(clave);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, contenido, 'utf8');
}
