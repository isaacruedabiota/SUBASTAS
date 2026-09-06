import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  anotarFalloFoto,
  fotosPendientesDe,
  marcarFotoDescargada,
} from '@subastas/db/adjuntos';
import { fetchBinario } from '../../http';
import { urlAdjunto } from './index';

/**
 * Descarga las fotografías del inmueble de UNA subasta.
 *
 * Compartida entre el worker por lotes (`npm run fotos`) y la web, que las pide
 * al abrir la ficha. Igual que la lectura de la ficha: una subasta concreta,
 * porque el usuario la está mirando.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
export const DIR_FOTOS = process.env.INGEST_DIR_FOTOS ?? join(RAIZ, 'data/fotos');

/** El docId trae caracteres que no valen en un nombre de fichero. */
export function nombreFichero(subastaId: string, docId: string, tipo: string): string {
  const ext = tipo.includes('png') ? 'png' : tipo.includes('gif') ? 'gif' : 'jpg';
  return `${subastaId}_${docId.replace(/[^A-Za-z0-9-]/g, '')}.${ext}`;
}

export interface ResultadoFotos {
  descargadas: number;
  fallos: number;
}

/**
 * Baja las fotos que falten de una subasta. Las ya descargadas no se repiten.
 * @param espera milisegundos entre fotos; 0 en la web, que es una sola ficha.
 */
export async function descargarFotosDe(
  subastaId: string,
  espera = 0,
): Promise<ResultadoFotos> {
  const pendientes = fotosPendientesDe(subastaId);
  let descargadas = 0;
  let fallos = 0;

  for (const { docId } of pendientes) {
    try {
      const { datos, tipo } = await fetchBinario(urlAdjunto(subastaId, docId));

      // El Portal responde 200 con HTML cuando el documento ya no está.
      if (!tipo.startsWith('image/')) throw new Error(`no es una imagen (${tipo})`);

      const nombre = nombreFichero(subastaId, docId, tipo);
      mkdirSync(DIR_FOTOS, { recursive: true });
      writeFileSync(join(DIR_FOTOS, nombre), datos);
      marcarFotoDescargada(subastaId, docId, nombre);
      descargadas++;
    } catch (e) {
      anotarFalloFoto(subastaId, docId, e instanceof Error ? e.message : String(e));
      fallos++;
    }

    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  }

  return { descargadas, fallos };
}
