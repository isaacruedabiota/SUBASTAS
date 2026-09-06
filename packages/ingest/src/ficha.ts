import './entorno';
import { guardarFichaPortal } from '@subastas/db/subastas';
import { guardarErrorCatastro, guardarFichaCatastro } from '@subastas/db/catastro';
import { formatImporteES, type Centimos } from '@subastas/core';
import {
  obtenerFichaSubasta,
  referenciasDeFicha,
} from './sources/portal-subastas/index';
import { consultarFichaCompleta } from './sources/catastro/index';

/**
 * Lee la ficha de UNA subasta del Portal, la guarda, y encadena el
 * enriquecimiento de Catastro con las referencias que traiga.
 *
 *   npm run ficha -- SUB-AT-2026-26R4586001001
 *   npm run ficha -- SUB-AT-2026-26R4586001001 --basica
 *
 * Esta es la operación "bajo demanda": es lo que se ejecuta cuando el usuario
 * abre una subasta en la app. No existe versión masiva, a propósito.
 *
 * `--basica` lee solo datos y bienes (2 peticiones en vez de 4). Es lo que hace
 * `npm run basicas` con lo que se anuncia cada día.
 */

const eur = (c: number | null) => (c === null ? 'no consta' : formatImporteES(c as Centimos));

const basica = process.argv.includes('--basica');

async function procesar(id: string): Promise<void> {
  console.log(`\n${'='.repeat(72)}\n${id}${basica ? '  (lectura básica)' : ''}\n${'='.repeat(72)}`);

  const ficha = await obtenerFichaSubasta(id, { basica });
  guardarFichaPortal(ficha);

  console.log(`  Tipo            : ${ficha.tipoSubasta ?? '-'}`);
  console.log(`  Autoridad       : ${ficha.autoridad?.descripcion ?? '-'}`);
  console.log(`  Estado          : ${ficha.estadoTexto ?? '-'}`);
  console.log(`  Inicio / fin    : ${ficha.fechaInicio ?? '-'}  →  ${ficha.fechaConclusion ?? '-'}`);
  console.log(`  Tasación        : ${eur(ficha.tasacion)}`);
  console.log(`  Valor subasta   : ${eur(ficha.valorSubasta)}`);
  console.log(`  Depósito (5%)   : ${eur(ficha.importeDeposito)}`);
  /* Ojo: en lectura básica la pestaña de pujas NO se pide, así que no saber el
     importe no significa que no haya pujas — significa que no se ha mirado. */
  console.log(
    `  Puja máxima     : ${
      ficha.pujaMaximaTexto ?? (basica ? 'no leída (lectura básica)' : 'no consta')
    }`,
  );

  if (ficha.tasacion && ficha.valorSubasta) {
    const dto = (1 - ficha.valorSubasta / ficha.tasacion) * 100;
    console.log(`  Salida vs tasac.: ${dto.toFixed(1)}% por debajo`);
  }

  if (ficha.numeroLotes > 0) {
    console.log(`  Lotes           : ${ficha.numeroLotes} (adjudicación separada)`);
  }

  for (const lote of ficha.lotes) {
    if (ficha.numeroLotes > 0) {
      console.log(`\n  ═══ Lote ${lote.numero} ═══`);
      console.log(`  Valor salida    : ${eur(lote.valorSubasta)}`);
      console.log(`  Tasación        : ${eur(lote.tasacion)}`);
      console.log(`  Depósito        : ${eur(lote.importeDeposito)}`);
    }

    for (const bien of lote.bienes) {
      console.log(`\n  --- Bien ${bien.numero}: ${bien.tipo ?? '?'} ---`);
      console.log(`  Dirección       : ${bien.direccion ?? '-'}`);
      console.log(`  Localidad       : ${bien.codigoPostal ?? ''} ${bien.localidad ?? '-'} (${bien.provincia ?? '-'})`);
      console.log(`  Ref. catastral  : ${bien.referenciaCatastral ?? 'no consta'}`);
      console.log(`  Situación pos.  : ${bien.situacionPosesoria ?? 'no consta'}`);
      console.log(`  Cargas          : ${bien.cargas ?? 'no consta'}`);
      console.log(`  Título jurídico : ${bien.tituloJuridico ?? '-'}`);
    }
  }

  // --- Enriquecimiento en cadena -------------------------------------------
  const referencias = referenciasDeFicha(ficha);
  if (referencias.length === 0) {
    console.log('\n  Sin referencia catastral: no hay nada que enriquecer.');
    return;
  }

  console.log(`\n  Enriqueciendo ${referencias.length} referencia(s) con Catastro...`);
  for (const rc of referencias) {
    try {
      const { ficha: cat, error, crudo } = await consultarFichaCompleta(rc);
      if (cat) {
        guardarFichaCatastro(cat, crudo);
        const sup =
          cat.superficieConstruidaM2 && cat.superficieConstruidaM2 > 0
            ? `${cat.superficieConstruidaM2} m2 construidos`
            : cat.superficieSueloM2
              ? `${cat.superficieSueloM2} m2 de suelo`
              : 'sin superficie';
        console.log(`    ${rc}`);
        console.log(`      ${cat.clase} · ${sup} · ${cat.usoPrincipal ?? '-'} · año ${cat.anioConstruccion ?? '-'}`);
        console.log(`      ${cat.direccionCompleta ?? '-'}`);
        console.log(`      coords ${cat.lat ?? '-'}, ${cat.lon ?? '-'}`);
        if (cat.urlPlano) console.log(`      plano  ${cat.urlPlano}`);
      } else {
        guardarErrorCatastro(rc, error ?? 'desconocido');
        console.log(`    ${rc}  sin datos: ${error}`);
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      guardarErrorCatastro(rc, mensaje);
      console.log(`    ${rc}  fallo: ${mensaje}`);
    }
  }
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2).filter((a) => a.startsWith('SUB-'));

  if (ids.length === 0) {
    console.error('Uso: npm run ficha -- SUB-XX-AAAA-XXXXX [...]');
    process.exitCode = 1;
    return;
  }

  for (const id of ids) {
    try {
      await procesar(id);
    } catch (e) {
      console.error(`\n${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
