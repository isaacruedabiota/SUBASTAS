import { estadoCola, limpiarDeCola, pendientesDePrecarga, registrarFallo } from '@subastas/db/cola';
import { guardarFichaPortal } from '@subastas/db/subastas';
import { guardarErrorCatastro, guardarFichaCatastro } from '@subastas/db/catastro';
import { evaluarTodas } from '@subastas/db/alertas';
import {
  importesAgregados,
  obtenerFichaSubasta,
  referenciasDeFicha,
} from './sources/portal-subastas/index';
import { consultarFichaCompleta } from './sources/catastro/index';

/**
 * Motor común de los dos recorridos de la cola.
 *
 * Son el mismo bucle con dos regímenes distintos, y esa diferencia es
 * deliberada (ver `cola.ts`):
 *
 * - `precargar` — lo anunciado antes de hoy, ficha COMPLETA. Es un recorrido
 *   sistemático de un sitio con `Disallow`, así que va lento y es interrumpible.
 * - `basicas` — lo anunciado hoy o después, ficha BÁSICA: dos pestañas. Lo demás
 *   se lee solo si el usuario abre esa ficha.
 *
 * Compartir el motor evita que diverjan, que es justo lo que pasó con el escaneo
 * de adjuntos: dos caminos para lo mismo y solo uno correcto.
 */

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OpcionesRecorrido {
  /** Solo anuncios anteriores a esta fecha (`YYYY-MM-DD`). */
  antesDe?: string;
  /** Solo anuncios desde esta fecha. */
  desde?: string;
  /** Lectura básica: datos y bienes, sin autoridad ni pujas. */
  basica?: boolean;
  limite: number;
  espera: number;
  titulo: string;
}

export async function recorrerCola(op: OpcionesRecorrido): Promise<void> {
  let parando = false;
  process.on('SIGINT', () => {
    console.log('\n\nParando tras la subasta en curso… (el progreso queda guardado)');
    parando = true;
  });

  const inicial = estadoCola();
  const aLeer = op.basica ? inicial.nuevas : inicial.atrasadas;

  console.log(`${op.titulo}
  Pendientes en este tramo : ${aLeer}
  Pendientes en total      : ${inicial.pendientes}  (${inicial.atrasadas} atrasadas · ${inicial.nuevas} nuevas)
  Ya leídas                : ${inicial.leidas}  (${inicial.basicas} solo en lo básico)
  Descartadas              : ${inicial.fallidas} (3 intentos fallidos)
  Ritmo                    : 1 cada ${(op.espera / 1000).toFixed(1)} s  (~${Math.round(3600000 / op.espera)}/hora)
`);

  if (aLeer === 0) {
    console.log('Nada que leer en este tramo.');
    return;
  }

  let leidas = 0;
  let fallos = 0;
  let enriquecidas = 0;
  const inicio = Date.now();

  while (!parando && leidas + fallos < op.limite) {
    const lote = pendientesDePrecarga(25, { antesDe: op.antesDe, desde: op.desde });
    if (lote.length === 0) break;

    for (const id of lote) {
      if (parando || leidas + fallos >= op.limite) break;

      try {
        const ficha = await obtenerFichaSubasta(id, { basica: op.basica });
        guardarFichaPortal(ficha);
        limpiarDeCola(id);
        leidas++;

        // Enriquecimiento en cadena: si la ficha trae referencia catastral, se
        // consulta el OVC en el mismo paso. También en la lectura básica — la
        // referencia sale de la pestaña de bienes, que sí se lee, y Catastro es
        // un servicio abierto que no impone las cautelas del Portal.
        for (const rc of referenciasDeFicha(ficha)) {
          try {
            const { ficha: cat, error, crudo } = await consultarFichaCompleta(rc);
            if (cat) {
              guardarFichaCatastro(cat, crudo);
              enriquecidas++;
            } else {
              guardarErrorCatastro(rc, error ?? 'desconocido');
            }
          } catch (e) {
            guardarErrorCatastro(rc, e instanceof Error ? e.message : String(e));
          }
        }

        const bien = ficha.lotes[0]?.bienes[0];
        const importe = importesAgregados(ficha).valorSubasta;
        console.log(
          `  ✓ ${id.padEnd(26)} ${(bien?.provincia ?? '—').padEnd(14)} ${
            importe !== null ? (importe / 100).toFixed(0) + ' €' : '—'
          }${ficha.numeroLotes > 1 ? `  (${ficha.numeroLotes} lotes)` : ''}`,
        );
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : String(e);
        registrarFallo(id, mensaje);
        fallos++;
        console.log(`  ✗ ${id.padEnd(26)} ${mensaje.slice(0, 70)}`);
      }

      if (!parando) await dormir(op.espera);
    }
  }

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  const final = estadoCola();

  console.log(`
--- ${parando ? 'Interrumpido' : 'Terminado'} (${minutos} min) ---
  Fichas leídas        : ${leidas}${op.basica ? ' (solo datos y bienes)' : ''}
  Enriquecidas Catastro: ${enriquecidas}
  Fallos               : ${fallos}
  Quedan pendientes    : ${op.basica ? final.nuevas : final.atrasadas} en este tramo`);

  // Con datos nuevos, las alertas pueden tener coincidencias que avisar.
  if (leidas > 0) {
    const { alertas, avisos } = evaluarTodas();
    if (alertas > 0) {
      console.log(`  Alertas revisadas    : ${alertas} → ${avisos} aviso(s) nuevo(s)`);
    }
  }
}

export function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
