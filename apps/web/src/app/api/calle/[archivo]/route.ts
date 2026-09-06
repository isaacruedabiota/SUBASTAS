import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { RUTA_BD } from '@subastas/db';

/**
 * Sirve las fotos de calle descargadas de Mapillary.
 *
 * Viven en data/calle/, fuera de public/, porque son datos y no parte del
 * código de la web: así data/ sigue siendo el único sitio con información y se
 * puede borrar entero sin tocar la app.
 *
 * Estas sí están guardadas en disco, al contrario que Street View: Mapillary
 * es CC-BY-SA 4.0. La atribución se pinta en la ficha.
 */

/* Se cuelga de la ruta de la BD en vez de process.cwd(), que cambia según
   desde dónde se lance Next. Es el mismo anclaje que usa packages/db. */
const DIR = process.env.INGEST_DIR_CALLES ?? join(dirname(RUTA_BD), 'calle');

/** Solo el nombre que genera el worker: REFCAT.jpg. Nada de rutas. */
const NOMBRE_VALIDO = /^[A-Z0-9]{1,25}\.(jpg|png)$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ archivo: string }> },
): Promise<Response> {
  const { archivo } = await params;

  // Sin esto, un "..%2F..%2Fsubastas.db" se saldría de data/calle.
  if (!NOMBRE_VALIDO.test(archivo)) {
    return new Response('Nombre no válido', { status: 400 });
  }

  try {
    const datos = await readFile(join(DIR, archivo));
    return new Response(new Uint8Array(datos), {
      headers: {
        'Content-Type': archivo.toLowerCase().endsWith('.png')
          ? 'image/png'
          : 'image/jpeg',
        // El fichero no cambia salvo que se vuelva a descargar a propósito.
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return new Response('No encontrada', { status: 404 });
  }
}
