/**
 * Consulta suelta al Catastro, sin tocar la base de datos.
 *
 *   npx tsx src/sources/catastro/consultar.ts 2704101VK3720D1521IO
 *
 * Útil para comprobar a mano qué devuelve el OVC para una referencia concreta.
 */
import { consultarFichaCompleta } from './index';

const referencias = process.argv.slice(2);

if (referencias.length === 0) {
  console.error('Uso: consultar.ts <referencia-catastral> [...]');
  process.exit(1);
}

for (const rc of referencias) {
  console.log(`\n=== ${rc} ===`);
  try {
    const { ficha, error } = await consultarFichaCompleta(rc);
    if (error) {
      console.log('  sin datos:', error);
    } else {
      console.log(JSON.stringify(ficha, null, 2));
    }
  } catch (e) {
    console.log('  fallo:', e instanceof Error ? e.message : String(e));
  }
}
