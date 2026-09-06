import './entorno';
import { consultaDesdeDireccion } from '@subastas/core';
import {
  anotarFalloGeocodificacion,
  estadoGeocodificacion,
  guardarGeocodificacion,
  pendientesDeGeocodificar,
} from '@subastas/db/geocodificacion';
import { geocodificar } from './sources/cartociudad/index';

/**
 * Saca coordenadas de la dirección con Cartociudad (IGN), para los inmuebles
 * que no tienen referencia catastral o cuya referencia Catastro no reconoce.
 *
 *   npm run geocodificar
 *   npm run geocodificar -- --limite 200 --espera 1500
 *
 * Sin coordenadas no hay ortofoto, ni punto en el mapa, ni vista de calle
 * precisa. Con ellas, ~390 subastas pasan a tener las tres cosas.
 *
 * Gratuito y sin clave, pero es un servicio público: ritmo tranquilo.
 */

const ESPERA_POR_DEFECTO_MS = 1200;

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

let parando = false;
process.on('SIGINT', () => {
  console.log('\n\nParando tras la dirección en curso…');
  parando = true;
});

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const limite = Number(argumento('limite') ?? Infinity);
  const espera = Number(argumento('espera') ?? ESPERA_POR_DEFECTO_MS);

  const inicial = estadoGeocodificacion();
  console.log(`Geocodificación de direcciones (Cartociudad · IGN)
  Sin coordenadas de Catastro: ${inicial.conDireccionSinCatastro}
  Ya resueltas               : ${inicial.resueltas}
  Sin resultado              : ${inicial.fallidas}
  Pendientes                 : ${inicial.pendientes}
  Ritmo                      : 1 cada ${(espera / 1000).toFixed(1)} s
`);

  if (inicial.pendientes <= 0) {
    console.log('Nada que geocodificar.');
    return;
  }

  let resueltas = 0;
  let sinResultado = 0;
  const inicio = Date.now();

  while (!parando && resueltas + sinResultado < limite) {
    const lote = pendientesDeGeocodificar(50);
    if (lote.length === 0) break;

    for (const p of lote) {
      if (parando || resueltas + sinResultado >= limite) break;

      const consulta = consultaDesdeDireccion(p.direccion, p.localidad, p.provincia);

      try {
        const punto = await geocodificar(p.direccion, p.localidad, p.provincia);

        if (punto) {
          guardarGeocodificacion(p.inmuebleId, punto, consulta ?? '');
          resueltas++;
          console.log(
            `  ✓ ${punto.lat.toFixed(5)}, ${punto.lon.toFixed(5)}  [${punto.precision.padEnd(9)}] ${(consulta ?? '').slice(0, 52)}`,
          );
        } else {
          anotarFalloGeocodificacion(p.inmuebleId, consulta, 'sin resultado utilizable');
          sinResultado++;
          console.log(`  · sin resultado                        ${(consulta ?? p.direccion).slice(0, 52)}`);
        }
      } catch (e) {
        anotarFalloGeocodificacion(
          p.inmuebleId,
          consulta,
          e instanceof Error ? e.message : String(e),
        );
        sinResultado++;
        console.log(`  ✗ ${(e instanceof Error ? e.message : String(e)).slice(0, 60)}`);
      }

      if (!parando) await dormir(espera);
    }
  }

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  const final = estadoGeocodificacion();

  console.log(`
--- Geocodificación ${parando ? 'interrumpida' : 'terminada'} (${minutos} min) ---
  Resueltas        : ${resueltas}
  Sin resultado    : ${sinResultado}
  Quedan pendientes: ${final.pendientes}
  Total con punto  : ${final.resueltas}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
