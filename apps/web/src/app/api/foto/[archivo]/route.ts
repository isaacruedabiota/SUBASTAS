import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { RUTA_BD } from '@subastas/db';

/**
 * Sirve las fotografías del inmueble descargadas del Portal (data/fotos/).
 *
 * Mismo planteamiento que /api/calle: viven fuera de public/ porque son datos,
 * y el nombre se valida antes de tocar el disco.
 */

const DIR = process.env.INGEST_DIR_FOTOS ?? join(dirname(RUTA_BD), 'fotos');

/** El worker las nombra SUB-XX-AAAA-ID_docid.jpg */
const NOMBRE_VALIDO = /^SUB-[A-Z]{2}-\d{4}-[A-Z0-9]+_[A-Za-z0-9-]{1,80}\.(jpg|png|gif)$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ archivo: string }> },
): Promise<Response> {
  const { archivo } = await params;

  if (!NOMBRE_VALIDO.test(archivo)) {
    return new Response('Nombre no válido', { status: 400 });
  }

  try {
    const datos = await readFile(join(DIR, archivo));
    const ext = archivo.toLowerCase().split('.').pop();
    return new Response(new Uint8Array(datos), {
      headers: {
        'Content-Type':
          ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return new Response('No encontrada', { status: 404 });
  }
}
