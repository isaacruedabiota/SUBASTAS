import { z } from 'zod';

/**
 * Servicios libres de la Sede Electrónica del Catastro (OVC).
 *
 *   https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC
 *     ?Provincia=&Municipio=&RefCat=<20 caracteres>
 *
 * Detalles que cuesta descubrir y conviene no volver a sufrir:
 *  - El parámetro se llama `RefCat`. Con `RC` el servicio responde 200 con el
 *    error 17 "LA REFERENCIA CATASTRAL ES OBLIGATORIA", que despista mucho.
 *  - Las coordenadas van en OTRO servicio (OVCCoordenadas.asmx, XML) y exigen
 *    la referencia de 14 posiciones, no la de 20.
 *  - La respuesta cambia de forma según la finca sea urbana (`cn: "UR"`) o
 *    rústica (`cn: "RU"`): la urbana trae calle/planta/puerta y la rústica
 *    polígono/parcela/paraje. Se normalizan a una sola forma.
 */

/** Respuesta cruda: se valida laxa y se normaliza después. */
const Direccion = z
  .object({
    tv: z.string().optional(), // tipo de vía: PS, CL, AV...
    nv: z.string().optional(), // nombre de vía
    pnp: z.string().optional(), // número
  })
  .passthrough();

const BienInmueble = z
  .object({
    idbi: z
      .object({
        cn: z.string().optional(), // UR | RU
      })
      .passthrough()
      .optional(),
    dt: z
      .object({
        np: z.string().optional(), // nombre provincia
        nm: z.string().optional(), // nombre municipio
        locs: z.any().optional(),
      })
      .passthrough()
      .optional(),
    ldt: z.string().optional(), // dirección literal completa
    debi: z
      .object({
        luso: z.string().optional(), // uso principal
        sfc: z.union([z.string(), z.number()]).optional(), // superficie construida m2
        ant: z.union([z.string(), z.number()]).optional(), // año de construcción
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const Finca = z
  .object({
    ldt: z.string().optional(),
    ltp: z.string().optional(), // tipo de parcela
    dff: z.object({ ss: z.union([z.string(), z.number()]).optional() }).passthrough().optional(),
    infgraf: z
      .object({ igraf: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const RespuestaDNPRC = z.object({
  consulta_dnprcResult: z
    .object({
      control: z.record(z.string(), z.unknown()).optional(),
      lerr: z
        .array(z.object({ cod: z.union([z.string(), z.number()]), des: z.string() }))
        .optional(),
      bico: z
        .object({
          bi: BienInmueble.optional(),
          finca: Finca.optional(),
          lcons: z.array(z.any()).optional(),
          lspr: z.array(z.any()).optional(),
        })
        .passthrough()
        .optional(),
      // Cuando la RC de 14 agrupa varios inmuebles, vienen en `lrcdnp`.
      lrcdnp: z.any().optional(),
    })
    .passthrough(),
});

/** Forma normalizada, que es lo que se guarda y lo que consume la app. */
export const FichaCatastro = z.object({
  referenciaCatastral: z.string(),
  clase: z.enum(['URBANA', 'RUSTICA', 'DESCONOCIDA']),
  provincia: z.string().nullable(),
  municipio: z.string().nullable(),
  direccionCompleta: z.string().nullable(),
  usoPrincipal: z.string().nullable(),
  superficieConstruidaM2: z.number().nullable(),
  superficieSueloM2: z.number().nullable(),
  anioConstruccion: z.number().int().nullable(),
  tipoFinca: z.string().nullable(),
  urlPlano: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  consultadoEn: z.string(),
});

export type FichaCatastro = z.infer<typeof FichaCatastro>;

const aNumero = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Mensaje de error del OVC, si la consulta no devolvió un inmueble. */
export function errorDeCatastro(crudo: unknown): string | null {
  const r = RespuestaDNPRC.safeParse(crudo);
  if (!r.success) return 'respuesta no reconocida';

  const res = r.data.consulta_dnprcResult;
  if (res.lerr?.length) return `${res.lerr[0]!.cod}: ${res.lerr[0]!.des}`;
  if (!res.bico?.bi) return 'sin datos de inmueble (¿referencia de 14 con varios inmuebles?)';
  return null;
}

export function normalizarCatastro(
  referenciaCatastral: string,
  crudo: unknown,
): FichaCatastro | null {
  const r = RespuestaDNPRC.safeParse(crudo);
  if (!r.success) return null;

  const bico = r.data.consulta_dnprcResult.bico;
  const bi = bico?.bi;
  if (!bi) return null;

  const cn = bi.idbi?.cn;

  return {
    referenciaCatastral,
    clase: cn === 'UR' ? 'URBANA' : cn === 'RU' ? 'RUSTICA' : 'DESCONOCIDA',
    provincia: bi.dt?.np ?? null,
    municipio: bi.dt?.nm ?? null,
    direccionCompleta: bi.ldt ?? bico?.finca?.ldt ?? null,
    usoPrincipal: bi.debi?.luso ?? null,
    superficieConstruidaM2: aNumero(bi.debi?.sfc),
    superficieSueloM2: aNumero(bico?.finca?.dff?.ss),
    anioConstruccion: aNumero(bi.debi?.ant),
    tipoFinca: bico?.finca?.ltp ?? null,
    urlPlano: bico?.finca?.infgraf?.igraf ?? null,
    lat: null,
    lon: null,
    consultadoEn: new Date().toISOString(),
  };
}

export type Direccion = z.infer<typeof Direccion>;
