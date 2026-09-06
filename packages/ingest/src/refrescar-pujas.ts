import './entorno';
import { abrirBd } from '@subastas/db';
import { registrarPuja, ultimaCapturaPuja } from '@subastas/db/subastas';
import { obtenerPujasSubasta } from './sources/portal-subastas/index';
import { cookieDeSesion } from './sources/portal-subastas/sesion';

/**
 * Refresca la puja de las subastas EN CURSO.
 *
 *   npm run pujas
 *   npm run pujas -- --limite 20 --espera 5000
 *
 * Una petición por subasta —solo la pestaña de pujas, no la ficha entera— y en
 * serie, con la cola de `http.ts`. Añade una fila a `estado_puja` por lectura:
 * es una serie temporal, así se ve cómo evoluciona la puja durante la subasta.
 *
 * **Con sesión abierta trae el importe; sin ella, solo si hay pujas o no.** Se
 * avisa al empezar, porque sin `npm run entrar` esto apenas aporta: el Portal
 * no publica la cifra a los anónimos hasta que la subasta concluye.
 */

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const limite = Number(argumento('limite') ?? Infinity);
const espera = Number(argumento('espera') ?? 4000);
/** No repetir una lectura reciente: por defecto, nada leído en la última hora. */
const frescura = Number(argumento('frescura') ?? 60 * 60 * 1000);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const eur = (c: number | null) =>
  c === null ? '—' : (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';

async function main(): Promise<void> {
  const conSesion = (await cookieDeSesion()) !== null;
  console.log(
    conSesion
      ? 'Sesión abierta: se leerá el importe de la puja.'
      : `⚠️  Sin sesión: el Portal no publica el importe de las subastas en curso.
    Solo se sabrá si hay pujas o no. Para ver la cifra: npm run entrar
`,
  );

  /* Con varios lotes cada uno se puja por separado y tiene su propia página
     (`&idLote=N`), así que hace falta una lectura por lote. Con lote único
     basta una y se guarda con `lote = NULL`. */
  const filas = abrirBd()
    .prepare(
      `SELECT s.identificador,
              (SELECT COUNT(*) FROM lotes WHERE subasta_id = s.identificador) AS numLotes
         FROM subastas s
        WHERE s.estado = 'CELEBRANDOSE'
        ORDER BY s.fecha_conclusion IS NULL, s.fecha_conclusion`,
    )
    .all() as Array<{ identificador: string; numLotes: number }>;

  const totalLecturas = filas.reduce((n, f) => n + Math.max(1, f.numLotes), 0);
  console.log(
    `${filas.length} subastas en curso · ${totalLecturas} lecturas ` +
      `(las de varios lotes piden una por lote).\n`,
  );

  let leidas = 0;
  let saltadas = 0;
  let cambios = 0;
  let fallos = 0;

  for (const { identificador: id, numLotes } of filas) {
    if (leidas >= limite) break;

    // null = subasta sin lotes separados; si los hay, se recorren todos.
    const lotes: Array<number | null> =
      numLotes > 1 ? Array.from({ length: numLotes }, (_, i) => i + 1) : [null];

    for (const lote of lotes) {
      if (leidas >= limite) break;

      const ultima = ultimaCapturaPuja(id, lote);
      if (ultima && Date.now() - Date.parse(ultima.capturadoEn) < frescura) {
        saltadas++;
        continue;
      }

      const etiqueta = lote === null ? id : `${id} lote ${lote}`;

      try {
        const p = await obtenerPujasSubasta(id, lote ?? undefined);
        registrarPuja(id, p);
        leidas++;

        const cambio =
          ultima === null ||
          ultima.pujaMaxima !== p.pujaMaxima ||
          ultima.situacion !== p.situacionPuja;
        if (cambio) cambios++;

        console.log(
          `  ${cambio ? '●' : ' '} ${etiqueta.padEnd(34)} ${(p.situacionPuja ?? '?').padEnd(9)} ${eur(p.pujaMaxima)}` +
            (cambio && ultima
              ? `   (antes: ${eur(ultima.pujaMaxima)} ${ultima.situacion ?? ''})`
              : ''),
        );
      } catch (e) {
        fallos++;
        console.log(`  ✗ ${etiqueta}  ${e instanceof Error ? e.message : e}`);
      }

      await dormir(espera);
    }
  }

  console.log(`
  Leídas   : ${leidas}
  Saltadas : ${saltadas} (leídas hace menos de ${Math.round(frescura / 60000)} min)
  Con cambio: ${cambios}
  Fallos   : ${fallos}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
