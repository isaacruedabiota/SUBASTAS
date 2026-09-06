import { z } from 'zod';

/**
 * Modelo unificado de subasta. Los nombres siguen la terminología del Portal de
 * Subastas del BOE en castellano a propósito: cuando haya que contrastar un campo
 * contra el anuncio original, el nombre debe coincidir con lo que pone la fuente.
 */

/**
 * Identificador oficial del Portal de Subastas. Es la clave primaria.
 *
 * El sufijo NO es numérico: la AEAT usa códigos alfanuméricos que incorporan
 * el código de la unidad de recaudación. Observado en anuncios reales del BOE:
 *   SUB-AT-2026-26R4586001001   (Agencia Tributaria)
 *   SUB-JA-2026-241891          (judicial)
 */
export const IdentificadorSubasta = z
  .string()
  .regex(/^SUB-[A-Z]{2}-\d{4}-[A-Z0-9]+$/, 'Identificador de subasta del BOE no válido');

/** El mismo patrón, para buscarlo dentro de un texto libre. */
export const PATRON_IDENTIFICADOR_SUBASTA = /\bSUB-[A-Z]{2}-\d{4}-[A-Z0-9]+\b/g;

export const TipoSubasta = z.enum([
  'JUDICIAL',
  'NOTARIAL',
  'ADMINISTRATIVA',
  'AGENCIA_TRIBUTARIA',
  'SEGURIDAD_SOCIAL',
  'OTRA',
]);

export const EstadoSubasta = z.enum([
  'PROXIMA_APERTURA',
  'CELEBRANDOSE',
  'CONCLUIDA',
  'SUSPENDIDA',
  'CANCELADA',
]);

export const TipoBien = z.enum(['INMUEBLE', 'VEHICULO', 'MUEBLE', 'OTRO']);

/** Importes en céntimos enteros. `null` = "no consta en el anuncio". */
const importe = z.number().int().nullable();

export const Coordenadas = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

/**
 * Datos que vienen de Catastro, no del anuncio. Es el enriquecimiento que
 * justifica el proyecto: el Portal muestra poco más que la dirección.
 */
export const DatosCatastro = z.object({
  referenciaCatastral: z.string().min(14).max(20),
  superficieConstruidaM2: z.number().positive().nullable(),
  superficieSueloM2: z.number().positive().nullable(),
  anioConstruccion: z.number().int().min(1000).max(2100).nullable(),
  usoPrincipal: z.string().nullable(),
  /** Escalera/planta/puerta cuando el inmueble es una división horizontal. */
  localizacion: z.string().nullable(),
  coordenadas: Coordenadas.nullable(),
  consultadoEn: z.string().datetime(),
});

export const Inmueble = z.object({
  direccion: z.string(),
  municipio: z.string(),
  provincia: z.string(),
  codigoPostal: z.string().regex(/^\d{5}$/).nullable(),
  referenciaCatastral: z.string().nullable(),
  /** Código Registral Único (antes IDUFIR), 14 dígitos. */
  cru: z.string().nullable(),
  descripcion: z.string().nullable(),
  /** Ocupado/libre. Determina buena parte del riesgo real de la operación. */
  situacionPosesoria: z.string().nullable(),
  visitable: z.boolean().nullable(),
  /** Cargas que NO se cancelan con la adjudicación. Crítico. */
  cargas: z.string().nullable(),
  catastro: DatosCatastro.nullable(),
});

export const Lote = z.object({
  numero: z.number().int().positive(),
  tipoBien: TipoBien,
  valorSubasta: importe,
  tasacion: importe,
  pujaMinima: importe,
  descripcion: z.string().nullable(),
  inmueble: Inmueble.nullable(),
});

/** Estado de puja. Solo se obtiene del Portal, no de la API del BOE. */
export const EstadoPuja = z.object({
  pujaMaxima: importe,
  numeroPujas: z.number().int().nonnegative().nullable(),
  numeroPujantes: z.number().int().nonnegative().nullable(),
  capturadoEn: z.string().datetime(),
});

/** Cómo acabó una subasta ya cerrada. Es la base de las vistas de histórico. */
export const Resultado = z.object({
  adjudicada: z.boolean(),
  importeAdjudicacion: importe,
  desierta: z.boolean(),
  /** importeAdjudicacion / tasacion. Null si falta cualquiera de los dos. */
  ratioSobreTasacion: z.number().positive().nullable(),
});

export const Subasta = z.object({
  identificador: IdentificadorSubasta,
  tipo: TipoSubasta,
  estado: EstadoSubasta,

  fechaInicio: z.string().datetime().nullable(),
  fechaConclusion: z.string().datetime().nullable(),

  autoridadGestora: z.string().nullable(),
  expediente: z.string().nullable(),
  nig: z.string().nullable(),

  valorSubasta: importe,
  tasacion: importe,
  pujaMinima: importe,
  importeDeposito: importe,
  tramosEntrePujas: importe,
  cantidadReclamada: importe,

  lotes: z.array(Lote),
  estadoPuja: EstadoPuja.nullable(),
  resultado: Resultado.nullable(),

  /** Trazabilidad: de dónde salió cada cosa y cuándo. */
  origen: z.object({
    urlAnuncioBoe: z.string().url().nullable(),
    idAnuncioBoe: z.string().nullable(),
    urlPortal: z.string().url().nullable(),
    ingeridoEn: z.string().datetime(),
    actualizadoEn: z.string().datetime(),
  }),
});

export type Subasta = z.infer<typeof Subasta>;
export type Lote = z.infer<typeof Lote>;
export type Inmueble = z.infer<typeof Inmueble>;
export type DatosCatastro = z.infer<typeof DatosCatastro>;
export type EstadoSubasta = z.infer<typeof EstadoSubasta>;
export type TipoSubasta = z.infer<typeof TipoSubasta>;
