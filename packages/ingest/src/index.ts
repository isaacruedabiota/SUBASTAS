import './entorno';
import { contarAnuncios } from '@subastas/db/anuncios';
import { ingestarRango } from './sources/boe-api/index';

/**
 * Ingesta desde la API de datos abiertos del BOE.
 *
 *   npm run ingest -- --dias 30
 *   npm run ingest -- --desde 2026-01-01 --hasta 2026-07-29
 *
 * Ojo con el alcance de esta fuente: el diario BOE trae del orden de una
 * subasta al día (Hacienda/Patrimonio, TGSS, entes públicos). Las judiciales y
 * notariales del Portal de Subastas NO se publican aquí. Ver CLAUDE.md.
 */

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const dias = Number(argumento('dias') ?? 30);
  const hasta = argumento('hasta') ? new Date(argumento('hasta')!) : new Date();
  const desde = argumento('desde')
    ? new Date(argumento('desde')!)
    : new Date(hasta.getTime() - (dias - 1) * 86_400_000);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  console.log(`Ingesta BOE: ${fmt(desde)} → ${fmt(hasta)}\n`);

  const inicio = Date.now();
  const r = await ingestarRango(desde, hasta, { verboso: true });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  const tipos = Object.entries(r.porTipo)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}=${n}`)
    .join('  ');

  console.log(`
--- Resumen (${segundos}s) ---
  Días consultados      : ${r.diasConsultados}  (${r.diasSinBoletin} sin boletín)
  Items en el sumario   : ${r.itemsTotales}
  Candidatos revisados  : ${r.candidatosInspeccionados}
  Anuncios guardados    : ${r.anunciosGuardados}
  Con subasta en Portal : ${r.conIdentificadorPortal}
  Con ref. catastral    : ${r.conReferenciaCatastral}
  Por tipo              : ${tipos || '-'}
  Errores               : ${r.errores.length}
  Total en la BD        : ${contarAnuncios()}`);

  for (const e of r.errores.slice(0, 10)) {
    console.log(`    ! ${e.contexto}: ${e.mensaje}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
