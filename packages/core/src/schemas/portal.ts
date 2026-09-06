import { z } from 'zod';

/**
 * Ficha de una subasta en el Portal de Subastas del BOE.
 *
 * Se construye a partir de las cuatro pestañas de `detalleSubasta.php`:
 *   ver=1 datos de la subasta · ver=2 autoridad gestora
 *   ver=3 bienes             · ver=5 pujas
 *
 * Todo es opcional a propósito. La riqueza de la ficha varía mucho según el
 * organismo: las de la AEAT (SUB-AT) traen referencia catastral, IDUFIR, cargas
 * con importe e inscripción registral; las judiciales (SUB-JA) a menudo solo
 * traen descripción y dirección. Un campo ausente no es un error.
 */

const importe = z.number().int().nullable();

export const BienPortal = z.object({
  numero: z.number().int().positive(),
  /** "Inmueble (Vivienda)", "Vehículo", ... tal como lo rotula el Portal. */
  tipo: z.string().nullable(),
  descripcion: z.string().nullable(),

  /** Clave de unión con Catastro. Es el campo que dispara el enriquecimiento. */
  referenciaCatastral: z.string().nullable(),
  /** Código Registral Único, antes IDUFIR. */
  idufir: z.string().nullable(),

  direccion: z.string().nullable(),
  codigoPostal: z.string().nullable(),
  localidad: z.string().nullable(),
  provincia: z.string().nullable(),

  viviendaHabitual: z.boolean().nullable(),
  /** Ocupado/libre. Junto con las cargas, define el riesgo real de la compra. */
  situacionPosesoria: z.string().nullable(),
  visitable: z.string().nullable(),
  /** Texto literal: puede ser "no consta" o un importe como "22.321,05 €". */
  cargas: z.string().nullable(),
  cargasImporte: importe,
  inscripcionRegistral: z.string().nullable(),
  tituloJuridico: z.string().nullable(),
  informacionAdicional: z.string().nullable(),
});

/**
 * ⚠️ «Sin puja mínima» NO es «no consta»: es lo contrario. Ver
 * `situacionPujaMinima` en el parser — 983 de 1.630 fichas lo dicen, y sin esto
 * la interfaz las mostraba como dato ausente cuando el Portal afirma que no hay
 * suelo para pujar.
 */
export const SituacionPujaMinima = z.enum(['IMPORTE', 'SIN_MINIMA', 'POR_LOTE']);

/**
 * Un lote de una subasta con adjudicación separada.
 *
 * Cuando la subasta tiene lotes, el Portal NO publica los importes en la
 * pestaña general (pone "Ver valor de subasta en cada lote") sino en la página
 * de cada lote, en `detalleSubasta.php?ver=3&idLote=N`. Leer solo la general
 * dejaba la ficha sin tasación ni valor de salida.
 *
 * Las subastas sin lotes se modelan como un único lote nº 1 sin importes
 * propios: los suyos son los de la subasta.
 */
export const LotePortal = z.object({
  numero: z.number().int().positive(),
  valorSubasta: importe,
  tasacion: importe,
  pujaMinima: importe,
  situacionPujaMinima: SituacionPujaMinima.nullable().default(null),
  importeDeposito: importe,
  tramosEntrePujas: importe,
  bienes: z.array(BienPortal),
});

export const AutoridadGestora = z.object({
  codigo: z.string().nullable(),
  descripcion: z.string().nullable(),
  direccion: z.string().nullable(),
  telefono: z.string().nullable(),
  correo: z.string().nullable(),
});

/**
 * Adjunto de la pestaña de bienes: foto del inmueble o documento PDF.
 *
 * Es el ÚNICO sitio donde el Portal publica fotos reales del bien. Son pocas
 * (5% de las subastas) pero valen su peso: "Vista fachada", "Vista aérea".
 * Entre los documentos está la certificación de cargas, que es justo el dato
 * que la ficha suele dejar en "no consta".
 */
export const AdjuntoPortal = z.object({
  docId: z.string(),
  titulo: z.string(),
  tipo: z.enum(['FOTO', 'DOCUMENTO']),
});

export const FichaPortal = z.object({
  identificador: z.string(),

  tipoSubasta: z.string().nullable(),
  cuentaExpediente: z.string().nullable(),
  /** ISO 8601 con offset: el Portal lo publica ya en ISO junto a la fecha local. */
  fechaInicio: z.string().nullable(),
  fechaConclusion: z.string().nullable(),
  anuncioBoe: z.string().nullable(),

  cantidadReclamada: importe,
  valorSubasta: importe,
  tasacion: importe,
  pujaMinima: importe,
  situacionPujaMinima: SituacionPujaMinima.nullable().default(null),
  tramosEntrePujas: importe,
  importeDeposito: importe,

  /** Texto de la puja máxima; "La subasta no ha recibido pujas." si está vacía. */
  pujaMaximaTexto: z.string().nullable(),
  pujaMaxima: importe,
  /**
   * Qué se sabe de la puja. El importe solo existe al concluir: en curso el
   * Portal dice si hay pujas pero no cuánto, y hay que poder distinguir
   * "no las hay" de "las hay y no te las enseño".
   */
  situacionPuja: z.enum(['CONOCIDA', 'SIN_PUJAS', 'OCULTA', 'SECRETA']).nullable(),
  /** Banner de estado literal del Portal ("LA SUBASTA HA CONCLUIDO..."). */
  estadoTexto: z.string().nullable(),

  /** Número de lotes que declara la ficha. 0 = "Sin lotes". */
  numeroLotes: z.number().int().nonnegative(),

  /**
   * Cuánto se ha leído.
   *
   * `BASICA` son las pestañas de datos y bienes: importes, fechas, dirección y
   * referencia catastral — lo que hace falta para el listado, el mapa y
   * Catastro. Deja fuera autoridad gestora y pujas, que se leen al abrir la
   * ficha. Importa guardarlo: sin esto no hay forma de distinguir "la autoridad
   * no consta" de "aún no se ha mirado".
   */
  nivelLectura: z.enum(['BASICA', 'COMPLETA']).default('COMPLETA'),

  autoridad: AutoridadGestora.nullable(),
  lotes: z.array(LotePortal),

  /** Fotos y documentos de la pestaña de bienes. Vacío en la mayoría. */
  adjuntos: z.array(AdjuntoPortal).default([]),

  capturadoEn: z.string(),
});

export type AdjuntoPortal = z.infer<typeof AdjuntoPortal>;
export type FichaPortal = z.infer<typeof FichaPortal>;
export type SituacionPuja = NonNullable<FichaPortal['situacionPuja']>;
export type SituacionPujaMinima = z.infer<typeof SituacionPujaMinima>;
export type LotePortal = z.infer<typeof LotePortal>;
export type BienPortal = z.infer<typeof BienPortal>;
export type AutoridadGestora = z.infer<typeof AutoridadGestora>;

/** Todos los bienes de la ficha, sin importar en qué lote estén. */
export function bienesDeFicha(ficha: FichaPortal): BienPortal[] {
  return ficha.lotes.flatMap((l) => l.bienes);
}
