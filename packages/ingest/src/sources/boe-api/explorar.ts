/**
 * Utilidad de diagnóstico, no forma parte de la ingesta.
 *
 *   npx tsx src/sources/boe-api/explorar.ts 20260728
 *
 * Sirve para responder a "¿qué hay realmente en el sumario de este día y en qué
 * sección?" sin tener que inventarse la estructura.
 */
import { PATRON_IDENTIFICADOR_SUBASTA } from '@subastas/core';
import { obtenerSumario, esConvocatoriaDeSubasta } from './sumario';
import { obtenerAnuncio } from './anuncio';

const fecha = process.argv[2] ?? '20260728';

const items = await obtenerSumario(fecha);

const porSeccion = new Map<string, { nombre: string; total: number; conSubasta: number }>();
for (const { item, seccionCodigo, seccionNombre } of items) {
  const e = porSeccion.get(seccionCodigo) ?? { nombre: seccionNombre, total: 0, conSubasta: 0 };
  e.total++;
  if (esConvocatoriaDeSubasta(item.titulo)) e.conSubasta++;
  porSeccion.set(seccionCodigo, e);
}

console.log(`=== SUMARIO ${fecha}: ${items.length} items ===`);
for (const [codigo, e] of [...porSeccion].sort()) {
  console.log(
    `  ${codigo.padEnd(3)} total=${String(e.total).padStart(4)}  titulo-dice-subasta=${String(e.conSubasta).padStart(3)}   ${e.nombre}`,
  );
}

// La pregunta de fondo: ¿hay anuncios que enlazan el Portal pero cuyo TÍTULO
// no menciona "subasta"? Si los hay, filtrar por título deja fuera subastas.
const sospechosos = items.filter(
  ({ item, seccionCodigo }) =>
    !esConvocatoriaDeSubasta(item.titulo) && (seccionCodigo === '4' || seccionCodigo === '5C'),
);

console.log(`\n=== Comprobando ${Math.min(12, sospechosos.length)} items de secciones 4 y 5C cuyo título NO dice "subasta" ===`);

let ocultas = 0;
for (const { item, seccionCodigo } of sospechosos.slice(0, 12)) {
  try {
    const anuncio = await obtenerAnuncio(item.identificador);
    const ids = [...new Set([...anuncio.texto.matchAll(PATRON_IDENTIFICADOR_SUBASTA)].map((m) => m[0]))];
    if (ids.length > 0) {
      ocultas++;
      console.log(`  [${seccionCodigo}] ${item.identificador} -> ${ids.join(', ')}`);
      console.log(`        titulo: ${item.titulo.slice(0, 80)}`);
    }
  } catch (e) {
    console.log(`  ! ${item.identificador}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(
  ocultas > 0
    ? `\n>>> ${ocultas} subastas se escapan del filtro por título. Hay que filtrar por TEXTO.`
    : '\n>>> Ninguna subasta oculta en la muestra: el filtro por título es suficiente.',
);
