import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { NextRequest } from 'next/server';
import { RUTA_BD } from '@subastas/db';

/**
 * Ortofoto aérea del PNOA (Plan Nacional de Ortofotografía Aérea) vía el WMS
 * del IGN.
 *
 * Es la pieza que faltaba para las subastas sin fotos del Portal:
 *
 *  - Gratuita, oficial y sin clave, a diferencia de la satelital de Google.
 *  - **Se puede guardar**: datos abiertos del IGN, reutilizables citando la
 *    fuente. Por eso aquí sí hay caché en disco y no solo del navegador.
 *  - Cubre el 100% del territorio, incluidas las rústicas donde no existe
 *    ninguna vista de calle.
 *
 * Se guarda al primer visionado: la segunda visita ya no toca el IGN.
 */

const WMS = 'https://www.ign.es/wms-inspire/pnoa-ma';
const DIR = process.env.INGEST_DIR_SATELITE ?? join(dirname(RUTA_BD), 'satelite');

/** Semilado de la caja en grados. ~120 m de cerca, ~600 m de contexto. */
const ZOOMS: Record<string, number> = { cerca: 0.0011, lejos: 0.0055 };

const ANCHO = 640;
const ALTO = 420;

/**
 * El listado pinta decenas de filas a la vez y cada una puede querer su
 * ortofoto. Sin esto saldrían 30 peticiones simultáneas contra un servicio
 * público y gratuito. Se encolan y se dejan 400 ms entre ellas; como el
 * resultado se guarda en disco, es un coste que se paga una sola vez.
 */
const ESPERA_MS = 400;
let cola: Promise<unknown> = Promise.resolve();

function enCola<T>(fn: () => Promise<T>): Promise<T> {
  const siguiente = cola
    .catch(() => undefined) // un fallo previo no rompe la cadena
    .then(async () => {
      const r = await fn();
      await new Promise((res) => setTimeout(res, ESPERA_MS));
      return r;
    });
  cola = siguiente;
  return siguiente;
}

function coordenada(valor: string | null, tope: number): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) && Math.abs(n) <= tope ? n : null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const p = request.nextUrl.searchParams;
  const lat = coordenada(p.get('lat'), 90);
  const lon = coordenada(p.get('lon'), 180);
  const zoom = p.get('zoom') ?? 'cerca';
  const semilado = ZOOMS[zoom];

  if (lat === null || lon === null || semilado === undefined) {
    return new Response('Parámetros no válidos', { status: 400 });
  }

  const clave = `${lat.toFixed(6)},${lon.toFixed(6)},${zoom}`;
  const fichero = join(DIR, `${createHash('sha1').update(clave).digest('hex').slice(0, 20)}.jpg`);

  const cabeceras = {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'private, max-age=86400',
  };

  if (existsSync(fichero)) {
    return new Response(new Uint8Array(readFileSync(fichero)), { headers: cabeceras });
  }

  /* WMS 1.3.0 con EPSG:4326 exige el BBOX en orden lat,lon — al revés que casi
     todo lo demás, que va lon,lat. Invertirlo devuelve un recorte del océano. */
  const bbox = [lat - semilado, lon - semilado, lat + semilado, lon + semilado].join(',');

  const url =
    `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage` +
    `&STYLES=&CRS=EPSG:4326&BBOX=${bbox}&WIDTH=${ANCHO}&HEIGHT=${ALTO}&FORMAT=image/jpeg`;

  try {
    const r = await enCola(() =>
      fetch(url, {
        headers: {
          'User-Agent':
            process.env.INGEST_USER_AGENT ?? 'SubastasPersonal/0.1 (uso personal)',
        },
      }),
    );

    if (!r.ok) return new Response('El IGN no devolvió la ortofoto', { status: 502 });

    const datos = Buffer.from(await r.arrayBuffer());

    // Ante un error, el WMS responde 200 con un XML: hay que mirar los bytes.
    if (!(datos[0] === 0xff && datos[1] === 0xd8)) {
      return new Response('El IGN no devolvió una imagen', { status: 502 });
    }

    mkdirSync(DIR, { recursive: true });
    writeFileSync(fichero, datos);

    return new Response(new Uint8Array(datos), { headers: cabeceras });
  } catch {
    return new Response('No se pudo consultar el IGN', { status: 502 });
  }
}
