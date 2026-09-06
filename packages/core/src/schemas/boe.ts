import { z } from 'zod';

/**
 * Esquemas de la API de datos abiertos del BOE.
 * https://www.boe.es/datosabiertos/api/boe/sumario/AAAAMMDD  (Accept: application/json)
 *
 * Escritos contra la forma real observada de la respuesta, no contra la
 * documentación: la API devuelve indistintamente un objeto o un array en
 * `departamento`, `item` y `seccion` según cuántos elementos haya.
 */

/** La API colapsa las listas de un solo elemento en objeto. Esto lo deshace. */
export const comoArray = <T>(valor: T | T[] | undefined | null): T[] => {
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
};

/** Acepta objeto suelto o array y siempre entrega array. */
const listaDe = <S extends z.ZodTypeAny>(esquema: S) =>
  z.preprocess((v) => comoArray(v), z.array(esquema));

export const ItemBoe = z.object({
  identificador: z.string(),
  titulo: z.string(),
  url_pdf: z
    .object({
      texto: z.string(),
      pagina_inicial: z.string().optional(),
      pagina_final: z.string().optional(),
    })
    .partial({ pagina_inicial: true, pagina_final: true })
    .optional(),
  url_html: z.string().optional(),
  url_xml: z.string().optional(),
});

/**
 * Algunas secciones agrupan los items bajo `epigrafe`, otras los cuelgan
 * directamente del departamento. Se contemplan las dos.
 */
export const EpigrafeBoe = z.object({
  nombre: z.string().optional(),
  item: listaDe(ItemBoe).optional(),
});

export const DepartamentoBoe = z.object({
  codigo: z.union([z.string(), z.number()]).optional(),
  nombre: z.string().optional(),
  item: listaDe(ItemBoe).optional(),
  epigrafe: listaDe(EpigrafeBoe).optional(),
});

export const SeccionBoe = z.object({
  codigo: z.union([z.string(), z.number()]),
  nombre: z.string(),
  departamento: listaDe(DepartamentoBoe).optional(),
});

export const DiarioBoe = z.object({
  numero: z.union([z.string(), z.number()]).optional(),
  seccion: listaDe(SeccionBoe).optional(),
});

export const SumarioBoe = z.object({
  status: z.object({
    code: z.union([z.string(), z.number()]),
    text: z.string().optional(),
  }),
  data: z.object({
    sumario: z.object({
      metadatos: z
        .object({
          publicacion: z.string().optional(),
          fecha_publicacion: z.string().optional(),
        })
        .optional(),
      diario: listaDe(DiarioBoe),
    }),
  }),
});

export type ItemBoe = z.infer<typeof ItemBoe>;
export type SeccionBoe = z.infer<typeof SeccionBoe>;
export type SumarioBoe = z.infer<typeof SumarioBoe>;

/**
 * Recorre el sumario y devuelve todos los items con su sección de origen.
 * El anidamiento real es sumario > diario > seccion > departamento > (epigrafe) > item.
 */
export function* itemsDelSumario(
  sumario: SumarioBoe,
): Generator<{ item: ItemBoe; seccionCodigo: string; seccionNombre: string }> {
  for (const diario of sumario.data.sumario.diario) {
    for (const seccion of diario.seccion ?? []) {
      const seccionCodigo = String(seccion.codigo);
      const seccionNombre = seccion.nombre;

      for (const dep of seccion.departamento ?? []) {
        for (const item of dep.item ?? []) {
          yield { item, seccionCodigo, seccionNombre };
        }
        for (const epi of dep.epigrafe ?? []) {
          for (const item of epi.item ?? []) {
            yield { item, seccionCodigo, seccionNombre };
          }
        }
      }
    }
  }
}
