import 'server-only';

import { guardarFichaPortal } from '@subastas/db/subastas';
import { guardarErrorCatastro, guardarFichaCatastro } from '@subastas/db/catastro';
import { limpiarDeCola, registrarFallo } from '@subastas/db/cola';
import {
  obtenerFichaSubasta,
  referenciasDeFicha,
} from '@subastas/ingest/portal';
import { consultarFichaCompleta } from '@subastas/ingest/catastro';

/**
 * Lectura bajo demanda de una ficha del Portal, con su enriquecimiento.
 *
 * Es la misma operación que `npm run ficha`, invocada desde la web cuando el
 * usuario pulsa el botón. Sigue siendo una petición por subasta mirada.
 */
export async function leerFichaYEnriquecer(
  id: string,
  opciones: { basica?: boolean } = {},
): Promise<void> {
  try {
    const ficha = await obtenerFichaSubasta(id, opciones);
    guardarFichaPortal(ficha);
    limpiarDeCola(id);

    for (const rc of referenciasDeFicha(ficha)) {
      try {
        const { ficha: cat, error, crudo } = await consultarFichaCompleta(rc);
        if (cat) guardarFichaCatastro(cat, crudo);
        else guardarErrorCatastro(rc, error ?? 'desconocido');
      } catch (e) {
        // El enriquecimiento es best-effort: nunca debe tumbar la lectura.
        guardarErrorCatastro(rc, e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    registrarFallo(id, mensaje);
    throw e;
  }
}
