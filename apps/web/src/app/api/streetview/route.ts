import type { NextRequest } from 'next/server';

/**
 * Proxy de la Street View Static API.
 *
 * Dos motivos para no poner la URL de Google directamente en un <img>:
 *
 *  1. La clave quedaría escrita en el HTML de cada ficha. Aquí se queda en el
 *     servidor y el navegador solo ve /api/streetview?lat=…&lon=…
 *  2. Permite consultar antes el endpoint de metadatos —que es gratuito— para
 *     saber si ese punto tiene panorámica. Sin esa comprobación Google
 *     devuelve una imagen gris de "no imagery", que en la ficha queda fatal.
 *
 * NO se guarda ninguna imagen: los términos de Google no lo permiten. Lo único
 * que hay es la caché normal del navegador, breve y privada.
 */

const ESTATICA = 'https://maps.googleapis.com/maps/api/streetview';
const METADATOS = 'https://maps.googleapis.com/maps/api/streetview/metadata';

/** Radio en el que Google busca una panorámica alrededor del punto. */
const RADIO_M = 120;

function coordenada(valor: string | null, tope: number): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) && Math.abs(n) <= tope ? n : null;
}

/**
 * Google acepta en `location` tanto un par de coordenadas como una dirección.
 * Es lo que permite dar vista de calle a las subastas sin referencia catastral:
 * hay 390 con dirección y sin coordenadas, casi tantas como las que sí las
 * tienen. Menos preciso, pero mucho mejor que no enseñar nada.
 */
function direccion(valor: string | null): string | null {
  if (valor === null) return null;
  const limpia = valor.replace(/\s+/g, ' ').trim();
  return limpia.length >= 5 && limpia.length <= 200 ? limpia : null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const clave = process.env.GOOGLE_MAPS_API_KEY;
  if (!clave) {
    return new Response('Street View no configurado', { status: 501 });
  }

  const p = request.nextUrl.searchParams;
  const lat = coordenada(p.get('lat'), 90);
  const lon = coordenada(p.get('lon'), 180);
  const dir = direccion(p.get('dir'));

  // Las coordenadas mandan si están; la dirección es el plan B.
  const localizacion =
    lat !== null && lon !== null ? `${lat},${lon}` : dir !== null ? dir : null;

  if (localizacion === null) {
    return new Response('Hace falta lat/lon o una dirección', { status: 400 });
  }

  /* El radio solo tiene sentido con coordenadas: con una dirección, Google ya
     resuelve al punto más próximo con panorámica y acotarlo la descarta. */
  const comun =
    `location=${encodeURIComponent(localizacion)}&source=outdoor&key=${clave}` +
    (lat !== null && lon !== null ? `&radius=${RADIO_M}` : '');

  try {
    // 1. ¿Hay panorámica? Esta llamada no consume cuota de imágenes.
    const meta = (await (await fetch(`${METADATOS}?${comun}`)).json()) as {
      status?: string;
    };

    if (meta.status !== 'OK') {
      return new Response('Sin panorámica en este punto', { status: 404 });
    }

    /* 2. La imagen. 640x400 es el máximo del tramo sin coste adicional.
       El fov acota el ángulo: 80 encuadra el inmueble, 120 da contexto de la
       calle. Se limita al rango que admite Google (10-120). */
    const fov = Math.min(120, Math.max(10, Number(p.get('fov')) || 80));
    const imagen = await fetch(`${ESTATICA}?size=640x400&fov=${fov}&${comun}`);
    if (!imagen.ok) {
      return new Response('Google no devolvió la imagen', { status: 502 });
    }

    return new Response(imagen.body, {
      headers: {
        'Content-Type': imagen.headers.get('content-type') ?? 'image/jpeg',
        // Caché temporal del navegador, no almacenamiento por nuestra parte.
        'Cache-Control': 'private, max-age=900',
      },
    });
  } catch {
    return new Response('No se pudo consultar Street View', { status: 502 });
  }
}
