import { z } from 'zod';

/**
 * Cartociudad — geocodificador oficial del IGN.
 *
 *   https://www.cartociudad.es/geocoder/api/geocoder/find?q=<dirección>
 *
 * Gratuito, sin clave y pensado para direcciones españolas, que es justo lo que
 * publica el Portal. Resuelve el hueco de las subastas sin referencia catastral
 * (o con una que Catastro no reconoce): sin coordenadas no hay ortofoto, ni
 * punto en el mapa, ni vista de calle precisa.
 *
 * Las coordenadas que da NO son las de Catastro: son del portal de la calle,
 * no del centroide de la parcela, y su fiabilidad depende de lo limpia que
 * venga la dirección. Por eso se guardan aparte y la ficha avisa del origen.
 */

/** Calidad del resultado, de mejor a peor. */
export const PRECISION_ACEPTABLE = new Set(['portal', 'Portal', 'callejero', 'Callejero']);

export const RespuestaCartociudad = z
  .object({
    lat: z.union([z.number(), z.string()]).nullable().optional(),
    lng: z.union([z.number(), z.string()]).nullable().optional(),
    /** portal | callejero | Municipio | Provincia | toponimo… */
    type: z.string().nullable().optional(),
    /** 0 = encontrado. Cualquier otra cosa es un resultado dudoso. */
    state: z.union([z.number(), z.string()]).nullable().optional(),
    address: z.string().nullable().optional(),
    muni: z.string().nullable().optional(),
    province: z.string().nullable().optional(),
    postalCode: z.string().nullable().optional(),
  })
  .passthrough();

export interface PuntoGeocodificado {
  lat: number;
  lon: number;
  precision: string;
  direccionNormalizada: string | null;
  municipio: string | null;
}

const aNumero = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Normaliza la respuesta, descartando lo que no sirve.
 *
 * Se exige precisión de **portal o callejero**: un resultado de tipo
 * "Municipio" devuelve el centro del pueblo, y pintar una ortofoto del
 * ayuntamiento como si fuera el inmueble sería peor que no enseñar nada.
 */
export function normalizarCartociudad(crudo: unknown): PuntoGeocodificado | null {
  const p = RespuestaCartociudad.safeParse(crudo);
  if (!p.success) return null;

  const { lat, lng, type, state } = p.data;

  const estado = aNumero(state);
  if (estado !== null && estado !== 0) return null;

  const y = aNumero(lat);
  const x = aNumero(lng);
  if (y === null || x === null) return null;

  // España peninsular, Baleares y Canarias entran de sobra en esta caja.
  if (y < 27 || y > 44 || x < -19 || x > 5) return null;

  const precision = (type ?? '').trim();
  if (!PRECISION_ACEPTABLE.has(precision)) return null;

  return {
    lat: y,
    lon: x,
    precision: precision.toLowerCase(),
    direccionNormalizada: p.data.address ?? null,
    municipio: p.data.muni ?? null,
  };
}

/**
 * Construye la consulta a partir de lo que publica el Portal.
 *
 * Las direcciones judiciales vienen con prosa registral delante ("PLANTA O
 * NIVEL 0, DEL EDIFICIO EN Cuesta de las Valdivias, número 29, planta
 * semisótano"), y eso despista al geocodificador. Se recorta a lo que parece
 * vía y número.
 */
export function consultaDesdeDireccion(
  direccion: string,
  localidad: string | null,
  provincia: string | null,
): string | null {
  let d = direccion.replace(/\s+/g, ' ').trim();

  // Quita el preámbulo registral hasta el "EN" que precede a la vía.
  d = d.replace(/^.*?\b(?:DEL EDIFICIO|EDIFICIO|FINCA|VIVIENDA|LOCAL)\b[^,]*?\bEN\b\s*/i, '');

  // Corta en el primer detalle de planta/puerta/escalera, que no geocodifica.
  d = d.split(/,?\s*(?:planta|piso|puerta|escalera|letra|bloque|portal\s+n)/i)[0]!.trim();

  /* El servicio es MUY quisquilloso con la forma del número. Medido contra
     direcciones reales:
       "Calle Dolores ibarruri nº 19, ALCALA DEL RIO, Sevilla"  -> 204 vacío
       "Calle Dolores Ibarruri 19, Alcala del Rio, Sevilla"     -> 200 correcto
     El "nº" basta para que no encuentre nada. Se quita, junto con los sufijos
     de planta pegados al número ("13-2º") y las abreviaturas sueltas del
     final ("13, BJ"). */
  d = d.replace(/\bn[.ºo°]{0,2}\s*(?=\d)/gi, '');
  d = d.replace(/\bn[úu]m(?:ero)?\.?\s*/gi, '');
  /* Sin `\b` al final: `º` no es carácter de palabra, así que "13-2º" al final
     de la cadena no casaba y el sufijo de planta se colaba en la consulta. */
  d = d.replace(/(\d)\s*-\s*\d+\s*[ºo°ªa](?![a-z])/gi, '$1');
  d = d.replace(/,\s*(?:bj|bajo|ent|atico|át?ico|s\/n)\.?\s*$/i, '');
  d = d.replace(/\s*\(\s*\d+\s*\)\s*$/, '');

  d = d.replace(/[,;]+$/, '').replace(/\s+/g, ' ').trim();
  if (d.length < 4) return null;

  /* Nada de "España" al final: el servicio solo cubre España y el país le
     sobra — con él responde 204 vacío hasta en direcciones que sí resuelve.
     Y las provincias bilingües llegan como "Valencia/València": se queda la
     primera forma, que es la que entiende el callejero. */
  const prov = provincia?.split('/')[0]?.trim() || null;

  // Con localidad basta; añadir además la provincia estrecha de más.
  return [d, localidad ?? prov].filter(Boolean).join(', ');
}
