'use server';

import { revalidatePath } from 'next/cache';
import { obtenerSubasta } from '@subastas/db/consultas';
import {
  alternarAlerta,
  borrarAlerta,
  crearAlerta,
  evaluarTodas,
  marcarAvisosVistos,
} from '@subastas/db/alertas';
import { leerFichaYEnriquecer } from '@/lib/portal';
import { descargarFotosDe } from '@subastas/ingest/portal-fotos';

/**
 * Acciones de servidor. Al no haber multiusuario no hay autorización que
 * comprobar, pero sí validación: son invocables por POST directo.
 */

export type ResultadoConsulta = { ok: true } | { ok: false; error: string };

/**
 * Lee la ficha de UNA subasta del Portal, la guarda y encadena Catastro.
 * Es la acción del botón "Consultar ficha" — el modelo bajo demanda.
 */
export async function consultarFicha(
  _estadoPrevio: ResultadoConsulta | null,
  formData: FormData,
): Promise<ResultadoConsulta> {
  const id = String(formData.get('id') ?? '').trim();

  if (!/^SUB-[A-Z]{2}-\d{4}-[A-Z0-9]+$/.test(id)) {
    return { ok: false, error: 'Identificador de subasta no válido.' };
  }

  // Si ya está leída no se vuelve a pedir al Portal.
  if (obtenerSubasta(id)) {
    revalidatePath(`/subasta/${id}`);
    return { ok: true };
  }

  try {
    await leerFichaYEnriquecer(id);
    revalidatePath(`/subasta/${id}`);
    revalidatePath('/');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Fallo al consultar el Portal.',
    };
  }
}

/**
 * Completa una ficha leída solo en lo básico.
 *
 * Lo nuevo se lee con dos pestañas (`npm run basicas`) para no pedirle al Portal
 * cuatro páginas de cada subasta que quizá nadie mire. Al abrir esta, sí la
 * mira: se leen las que faltan —autoridad gestora y pujas— y queda COMPLETA.
 * La llama la propia ficha al cargarse, así que sigue siendo bajo demanda.
 */
export async function completarFicha(subastaId: string): Promise<ResultadoConsulta> {
  const id = subastaId.trim();

  if (!/^SUB-[A-Z]{2}-\d{4}-[A-Z0-9]+$/.test(id)) {
    return { ok: false, error: 'Identificador de subasta no válido.' };
  }

  // Si ya está completa no se vuelve a pedir nada.
  if (obtenerSubasta(id)?.lectura === 'COMPLETA') return { ok: true };

  try {
    await leerFichaYEnriquecer(id);
    revalidatePath(`/subasta/${id}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Fallo al completar la ficha.',
    };
  }
}

export type ResultadoFotos =
  | { ok: true; descargadas: number; fallos: number }
  | { ok: false; error: string };

/**
 * Descarga las fotos que el Portal publica de esta subasta.
 *
 * La llama la propia ficha al abrirse, así que sigue siendo el modelo bajo
 * demanda: una subasta que el usuario está mirando. Las ya descargadas no se
 * vuelven a pedir, de modo que la segunda visita no genera tráfico.
 */
export async function descargarFotos(subastaId: string): Promise<ResultadoFotos> {
  const id = subastaId.trim();

  if (!/^SUB-[A-Z]{2}-\d{4}-[A-Z0-9]+$/.test(id)) {
    return { ok: false, error: 'Identificador de subasta no válido.' };
  }

  try {
    const { descargadas, fallos } = await descargarFotosDe(id);
    if (descargadas > 0) revalidatePath(`/subasta/${id}`);
    return { ok: true, descargadas, fallos };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Fallo al descargar las fotos.',
    };
  }
}

/* ----------------------------- alertas ----------------------------- */

const numeroONull = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Los importes se piden en euros y se guardan en céntimos. */
const eurosACentimos = (v: FormDataEntryValue | null): number | null => {
  const n = numeroONull(v);
  return n === null ? null : Math.round(n * 100);
};

export async function guardarAlerta(formData: FormData): Promise<void> {
  const nombre = String(formData.get('nombre') ?? '').trim();
  if (nombre === '') return;

  crearAlerta({
    nombre,
    activa: true,
    provincia: (String(formData.get('provincia') ?? '').trim() || null) as string | null,
    texto: (String(formData.get('texto') ?? '').trim() || null) as string | null,
    tipo: (String(formData.get('tipo') ?? '').trim() || null) as string | null,
    precioMin: eurosACentimos(formData.get('precioMin')),
    precioMax: eurosACentimos(formData.get('precioMax')),
    superficieMin: numeroONull(formData.get('superficieMin')),
    superficieMax: numeroONull(formData.get('superficieMax')),
    anioMin: numeroONull(formData.get('anioMin')),
    descuentoMin: numeroONull(formData.get('descuentoMin')),
    sinCargas: formData.get('sinCargas') === '1',
    soloActivas: formData.get('soloActivas') === '1',
  });

  evaluarTodas();
  revalidatePath('/alertas');
}

export async function eliminarAlerta(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (Number.isInteger(id)) borrarAlerta(id);
  revalidatePath('/alertas');
}

export async function conmutarAlerta(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (Number.isInteger(id)) alternarAlerta(id);
  revalidatePath('/alertas');
}

export async function revisarAlertas(): Promise<void> {
  evaluarTodas();
  revalidatePath('/alertas');
}

export async function marcarVistos(): Promise<void> {
  marcarAvisosVistos();
  revalidatePath('/alertas');
}
