/**
 * Prueba el parser contra ficheros HTML guardados, sin pedir nada al Portal.
 *
 *   npx tsx src/sources/portal-subastas/probar-parser.ts <dir> <SUB-ID> [...]
 *
 * Espera ficheros con el nombre `<SUB-ID>_ver<N>.html`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FichaPortal } from '@subastas/core';
import {
  parsearAutoridad,
  parsearBienes,
  parsearDatosSubasta,
  parsearPujas,
} from './parser';

const [dir, ...ids] = process.argv.slice(2);

if (!dir || ids.length === 0) {
  console.error('Uso: probar-parser.ts <directorio> <SUB-ID> [...]');
  process.exit(1);
}

for (const id of ids) {
  const leer = (ver: number) => readFileSync(join(dir, `${id}_ver${ver}.html`), 'utf8');

  const datos = parsearDatosSubasta(leer(1));

  const ficha = FichaPortal.parse({
    ...datos,
    identificador: id,
    ...parsearPujas(leer(5)),
    autoridad: parsearAutoridad(leer(2)),
    // Sin red no se pueden pedir las páginas de cada lote: se prueba con el
    // lote implícito, que es el caso de la mayoría de las subastas.
    lotes: [
      {
        numero: 1,
        valorSubasta: datos.valorSubasta,
        tasacion: datos.tasacion,
        pujaMinima: datos.pujaMinima,
        importeDeposito: datos.importeDeposito,
        tramosEntrePujas: datos.tramosEntrePujas,
        bienes: parsearBienes(leer(3)),
      },
    ],
    capturadoEn: new Date().toISOString(),
  });

  console.log('\n' + '='.repeat(78));
  console.log(`${ficha.identificador}  ${ficha.tipoSubasta}`);
  console.log(`  estado    : ${ficha.estadoTexto ?? '-'}`);
  console.log(`  puja max  : ${ficha.pujaMaximaTexto ?? '-'}  (${ficha.pujaMaxima ?? '-'} cent.)`);
  console.log(`  tasacion  : ${ficha.tasacion ?? '-'}   valor: ${ficha.valorSubasta ?? '-'}`);
  console.log(`  lotes     : ${ficha.numeroLotes || 'sin lotes'}`);

  for (const lote of ficha.lotes) {
    for (const b of lote.bienes) {
      console.log(`    #${b.numero} ${b.tipo ?? '?'}  refcat=${b.referenciaCatastral ?? '-'}  cargas=${b.cargas ?? 'no consta'}`);
      console.log(`        ${b.direccion ?? '-'} · ${b.codigoPostal ?? '-'} ${b.localidad ?? '-'} (${b.provincia ?? '-'})`);
    }
  }
}
