import './entorno';
import * as cheerio from 'cheerio';
import { abrirBd } from '@subastas/db';
import { fetchTexto } from './http';
import {
  cookieDeSesion,
  importeReservado,
  olvidarSesion,
  sesionAbiertaEn,
  tieneSesion,
} from './sources/portal-subastas/sesion';
import { parsearPujas } from './sources/portal-subastas/index';

/**
 * Comprueba que la sesión del Portal sigue viva y que se ve el importe.
 *
 *   npm run probar-sesion                        # elige una subasta con pujas ocultas
 *   npm run probar-sesion -- SUB-JA-2026-264608
 *
 * Hace UNA petición, saltándose la caché: la gracia es ver qué devuelve el
 * Portal ahora mismo. Es también el sitio donde comprobar el parseo con sesión,
 * porque sin ella esa página nunca trae cifra.
 */

const BASE = 'https://subastas.boe.es/detalleSubasta.php';

/** Una subasta en curso que el Portal declara con pujas pero sin importe. */
function subastaConPujasOcultas(): string | null {
  const f = abrirBd()
    .prepare(
      `SELECT e.subasta_id AS id
         FROM estado_puja e
         JOIN subastas s ON s.identificador = e.subasta_id
        WHERE e.situacion = 'OCULTA' AND s.estado = 'CELEBRANDOSE'
        ORDER BY s.fecha_conclusion
        LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  return f?.id ?? null;
}

async function main(): Promise<void> {
  const cookie = await cookieDeSesion();
  if (cookie === null) {
    console.log(`No hay sesión abierta.

El Portal usa doble factor, así que no se puede entrar solo con las
credenciales de .env: manda un código al correo y al móvil. Ejecuta:

  npm run entrar

Sin sesión todo sigue funcionando: las subastas en curso quedan como "hay
pujas, importe reservado", que es lo que el Portal dice de verdad.`);
    return;
  }

  console.log(`Sesión guardada el ${sesionAbiertaEn() ?? '?'}`);

  const id = process.argv[2]?.trim().toUpperCase() ?? subastaConPujasOcultas();
  if (!id) {
    console.log(`
No hay ninguna subasta en curso con pujas ocultas en la base.
Pásale un identificador: npm run probar-sesion -- SUB-JA-2026-264608`);
    return;
  }

  console.log(`Leyendo la pestaña de pujas de ${id} (sin caché)...`);
  const url = `${BASE}?idSub=${encodeURIComponent(id)}&ver=5&idBus=&idLote=&numPagBus=`;
  const html = await fetchTexto(url, { headers: { Cookie: cookie } });

  const $ = cheerio.load(html);
  $('script, style').remove();
  const pujas = parsearPujas(html);

  // Con sesión la sección se titula «Puja más alta»; sin ella, «Puja máxima…».
  const bloque = $('h4')
    .toArray()
    .map((e) => {
      const $e = $(e);
      return `${$e.text().trim()}: ${$e.nextAll('p, div').first().text().replace(/\s+/g, ' ').trim()}`;
    })
    .filter((t) => /puja/i.test(t))
    .join('\n    ');

  console.log(`
  ¿Sesión viva?       : ${tieneSesion(html) ? 'SÍ' : 'NO'}
  ¿Importe tapado?    : ${importeReservado(html) ? 'SÍ — la sesión ya no vale, repite npm run entrar' : 'no'}
  Situación detectada : ${pujas.situacionPuja ?? 'ninguna'}
  Importe parseado    : ${pujas.pujaMaxima !== null ? `${(pujas.pujaMaxima / 100).toFixed(2)} €` : '—'}

  Secciones de puja, tal cual llegan:
    ${bloque || '(ninguna)'}
`);

  /* Si el Portal ha vuelto a tapar el importe, la sesión guardada ya no vale y
     hay que tirarla aquí mismo. Dejarla puesta haría que /cuenta siguiera
     diciendo "sesión abierta" sabiendo que no lo está — el mismo error que
     decir "sin pujas" cuando lo único que consta es que no se ven. */
  if (importeReservado(html)) {
    olvidarSesion();
    console.log('  → Sesión descartada. Vuelve a entrar desde /cuenta o con npm run entrar.\n');
  }

  if (pujas.situacionPuja === null) {
    console.log(`⚠️  No se ha reconocido la situación. El Portal puede haber cambiado
    la plantilla: mira el texto de arriba y ajusta \`parsearPujas\`.`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
