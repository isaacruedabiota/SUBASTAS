import './entorno';
import {
  anotarFallo,
  estadoCalles,
  guardarFoto,
  marcarSinCobertura,
  pendientesDeFoto,
} from '@subastas/db/calles';
import { buscarFotoCalle, descargarFoto, hayToken } from './sources/mapillary/index';

/**
 * Descarga fotos de calle de Mapillary para los inmuebles con coordenadas.
 *
 *   npm run calles                       # hasta agotar los pendientes
 *   npm run calles -- --limite 100 --espera 1500
 *
 * Mapillary es CC-BY-SA 4.0: estas imágenes SÍ se pueden guardar, al contrario
 * que las de Street View. Aun así el ritmo es tranquilo — es una API gratuita.
 *
 * Interrumpible con Ctrl+C: lo descargado queda, y "no había foto aquí" también
 * se anota para no volver a preguntar por el mismo sitio.
 */

const ESPERA_POR_DEFECTO_MS = 1200;

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

let parando = false;
process.on('SIGINT', () => {
  console.log('\n\nParando tras la foto en curso… (lo descargado queda guardado)');
  parando = true;
});

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (!hayToken()) {
    console.error(`Falta MAPILLARY_TOKEN.

  1. Entra en https://www.mapillary.com/dashboard/developers
  2. Crea una aplicación y copia el token (empieza por MLY|)
  3. Añádelo a .env en la raíz:  MAPILLARY_TOKEN=MLY|...

Es gratuito y no pide tarjeta.`);
    process.exitCode = 1;
    return;
  }

  const limite = Number(argumento('limite') ?? Infinity);
  const espera = Number(argumento('espera') ?? ESPERA_POR_DEFECTO_MS);

  const inicial = estadoCalles();
  console.log(`Fotos de calle (Mapillary, CC-BY-SA 4.0)
  Con coordenadas: ${inicial.conCoordenadas}
  Ya descargadas : ${inicial.conFoto}
  Sin cobertura  : ${inicial.sinCobertura}
  Pendientes     : ${inicial.pendientes}
`);

  if (inicial.pendientes <= 0) {
    console.log('Nada que descargar.');
    return;
  }

  let descargadas = 0;
  let sinFoto = 0;
  let fallos = 0;
  const inicio = Date.now();

  while (!parando && descargadas + sinFoto + fallos < limite) {
    const lote = pendientesDeFoto(50);
    if (lote.length === 0) break;

    for (const { referenciaCatastral: rc, lat, lon } of lote) {
      if (parando || descargadas + sinFoto + fallos >= limite) break;

      try {
        const foto = await buscarFotoCalle(lat, lon);

        if (!foto) {
          marcarSinCobertura(rc);
          sinFoto++;
          console.log(`  · ${rc}  sin cobertura`);
        } else {
          const ruta = await descargarFoto(rc, foto);
          guardarFoto(rc, foto, ruta);
          descargadas++;
          console.log(
            `  ✓ ${rc}  a ${foto.distanciaM.toFixed(0)} m` +
              `${foto.capturadaEn ? `  (${foto.capturadaEn.slice(0, 7)})` : ''}` +
              `${foto.autor ? `  © ${foto.autor}` : ''}`,
          );
        }
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : String(e);
        anotarFallo(rc, mensaje);
        fallos++;
        console.log(`  ✗ ${rc}  ${mensaje.slice(0, 70)}`);
      }

      if (!parando) await dormir(espera);
    }
  }

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  const final = estadoCalles();

  console.log(`
--- Fotos de calle ${parando ? 'interrumpidas' : 'terminadas'} (${minutos} min) ---
  Descargadas      : ${descargadas}
  Sin cobertura    : ${sinFoto}
  Fallos           : ${fallos}
  Quedan pendientes: ${final.pendientes}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
