import './entorno';
import { estadoAdjuntos, fotosPendientes } from '@subastas/db/adjuntos';
import { descargarFotosDe } from './sources/portal-subastas/descargar-fotos';

/**
 * Descarga las fotografías que el Portal publica de los inmuebles.
 *
 *   npm run fotos
 *   npm run fotos -- --limite 50 --espera 5000
 *
 * Son pocas — el 5% de las subastas traen— pero es la única foto del bien que
 * existe en una fuente oficial: "Vista fachada", "Vista aérea ubicación".
 *
 * Los metadatos ya estaban en el HTML de la ficha; aquí solo se bajan los
 * ficheros. Mismo ritmo prudente que la precarga, y por el mismo motivo:
 * el Portal tiene `Disallow: /` y esto es uso personal, no redistribuible.
 */

const ESPERA_POR_DEFECTO_MS = 4000;

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

let parando = false;
process.on('SIGINT', () => {
  console.log('\n\nParando tras la foto en curso… (lo descargado queda)');
  parando = true;
});

async function main(): Promise<void> {
  const limite = Number(argumento('limite') ?? Infinity);
  const espera = Number(argumento('espera') ?? ESPERA_POR_DEFECTO_MS);

  const inicial = estadoAdjuntos();
  console.log(`Fotografías del Portal
  Subastas con fotos: ${inicial.subastasConFotos}
  Fotos catalogadas : ${inicial.fotos}
  Ya descargadas    : ${inicial.fotosDescargadas}
  Documentos (PDF)  : ${inicial.documentos}  (no se descargan, se enlazan)
  Ritmo             : 1 cada ${(espera / 1000).toFixed(1)} s
`);

  const pendientes = inicial.fotos - inicial.fotosDescargadas;
  if (pendientes <= 0) {
    console.log('Nada que descargar.');
    return;
  }

  let bajadas = 0;
  let fallos = 0;
  const inicio = Date.now();

  /* Se agrupa por subasta y se delega en descargarFotosDe, la misma función que
     usa la web al abrir una ficha: un solo camino, no dos que puedan divergir. */
  while (!parando && bajadas + fallos < limite) {
    const lote = fotosPendientes(50);
    if (lote.length === 0) break;

    const porSubasta = [...new Set(lote.map((f) => f.subastaId))];

    for (const subastaId of porSubasta) {
      if (parando || bajadas + fallos >= limite) break;

      const r = await descargarFotosDe(subastaId, espera);
      bajadas += r.descargadas;
      fallos += r.fallos;

      console.log(
        `  ${r.fallos === 0 ? '✓' : '✗'} ${subastaId.padEnd(26)} ${r.descargadas} foto(s)` +
          (r.fallos > 0 ? `  ${r.fallos} fallo(s)` : ''),
      );
    }
  }

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  const final = estadoAdjuntos();

  console.log(`
--- Fotos ${parando ? 'interrumpidas' : 'terminadas'} (${minutos} min) ---
  Descargadas      : ${bajadas}
  Fallos           : ${fallos}
  Total en disco   : ${final.fotosDescargadas} de ${final.fotos}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
