import './entorno';
import type { FichaCatastro } from '@subastas/core';
import {
  contarCatastro,
  guardarErrorCatastro,
  guardarFichaCatastro,
  referenciasPendientes,
} from '@subastas/db/catastro';
import { consultarFichaCompleta } from './sources/catastro/index';

/**
 * Enriquecimiento con Catastro de las referencias vistas en anuncios del BOE.
 *
 *   npm run enriquecer -- --limite 50
 *
 * Es best-effort: una referencia que el OVC no reconoce se marca con su error y
 * no se reintenta, pero nunca rompe el proceso.
 */

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * En una finca rústica la superficie construida es 0 y la que importa es la del
 * suelo; en una urbana es al revés. Mostrar siempre `sfc` daba "0 m2" en todas
 * las rústicas, que es justo el dato que interesa de una finca de 526.978 m².
 */
function superficieLegible(ficha: FichaCatastro): string {
  const { superficieConstruidaM2: construida, superficieSueloM2: suelo } = ficha;

  if (construida && construida > 0) return `${construida} m2 constr.`;
  if (suelo && suelo > 0) return `${suelo} m2 suelo`;
  return 'sin superficie';
}

async function main(): Promise<void> {
  const limite = Number(argumento('limite') ?? 50);
  const pendientes = referenciasPendientes(limite);

  if (pendientes.length === 0) {
    console.log('No hay referencias catastrales pendientes.');
    return;
  }

  console.log(`Consultando ${pendientes.length} referencias al Catastro...\n`);

  let ok = 0;
  let fallos = 0;

  for (const rc of pendientes) {
    try {
      const { ficha, error, crudo } = await consultarFichaCompleta(rc);

      if (ficha) {
        guardarFichaCatastro(ficha, crudo);
        ok++;
        console.log(
          `  OK   ${rc}  ${ficha.clase.padEnd(7)} ${superficieLegible(ficha).padStart(16)}  ${(ficha.usoPrincipal ?? '-').padEnd(10)} ${ficha.direccionCompleta ?? ''}`.slice(0, 160),
        );
      } else {
        guardarErrorCatastro(rc, error ?? 'desconocido');
        fallos++;
        console.log(`  --   ${rc}  ${error}`);
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      guardarErrorCatastro(rc, mensaje);
      fallos++;
      console.log(`  !!   ${rc}  ${mensaje}`);
    }
  }

  const total = contarCatastro();
  console.log(
    `\n--- ${ok} enriquecidas, ${fallos} sin datos. En la BD: ${total.total} (${total.conError} con error) ---`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
