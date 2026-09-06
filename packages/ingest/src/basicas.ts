import './entorno';
import { hoy } from '@subastas/db/cola';
import { argumento, recorrerCola } from './recorrido';

/**
 * Lectura BÁSICA de lo que se anuncia **de hoy en adelante**.
 *
 *   npm run basicas
 *   npm run basicas -- --limite 100 --espera 5000
 *
 * Dos pestañas por subasta —datos y bienes— en vez de las cuatro de la ficha
 * completa. Con eso el listado ya tiene importes, fechas, dirección, provincia
 * y referencia catastral: se puede filtrar, ordenar, ver en el mapa y encadenar
 * Catastro. Lo que falta (autoridad gestora, pujas y fotos) se lee solo si el
 * usuario abre esa ficha.
 *
 * El razonamiento es de tráfico: de un día para otro entran decenas o cientos de
 * subastas y casi ninguna se llega a mirar. Pedirle al Portal cuatro páginas de
 * cada una sería gastar el triple para datos que nadie va a leer.
 *
 * Pensado para lanzarlo detrás de `npm run ingest`, que es quien trae del BOE
 * los identificadores nuevos.
 */

recorrerCola({
  titulo: 'Lectura básica de las subastas nuevas (datos y bienes)',
  desde: hoy(),
  basica: true,
  limite: Number(argumento('limite') ?? Infinity),
  espera: Number(argumento('espera') ?? 4000),
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
