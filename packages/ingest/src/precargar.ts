import './entorno';
import { hoy } from '@subastas/db/cola';
import { argumento, recorrerCola } from './recorrido';

/**
 * Precarga COMPLETA de las fichas atrasadas — las anunciadas **antes de hoy**.
 *
 *   npm run precargar                  # hasta agotar el atraso
 *   npm run precargar -- --limite 200 --espera 5000
 *
 * DELIBERADAMENTE LENTO. El Portal tiene `robots.txt: Disallow: /` y esto es un
 * recorrido sistemático, así que el ritmo por defecto es de una subasta cada
 * 4 segundos (~900/hora) y el proceso es interrumpible y reanudable: lo ya
 * leído no se vuelve a pedir, y lo que falla tres veces se abandona.
 *
 * Lo que se anuncie de hoy en adelante NO entra aquí: va por `npm run basicas`,
 * que lee dos pestañas en vez de cuatro y deja el resto para cuando el usuario
 * abra la ficha. Así el recorrido masivo tiene final, en vez de repetirse cada
 * día sobre todo lo nuevo.
 *
 * Ctrl+C en cualquier momento; la siguiente ejecución sigue donde lo dejó.
 */

recorrerCola({
  titulo: 'Precarga de fichas atrasadas (lectura completa)',
  antesDe: hoy(),
  limite: Number(argumento('limite') ?? Infinity),
  espera: Number(argumento('espera') ?? 4000),
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
