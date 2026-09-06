/**
 * Todo el dinero del proyecto se maneja en céntimos enteros. Nunca float:
 * los importes de subasta se comparan y agregan, y 0.1 + 0.2 !== 0.3.
 */

export type Centimos = number & { readonly __brand: 'Centimos' };

export const centimos = (n: number): Centimos => {
  if (!Number.isInteger(n)) {
    throw new TypeError(`Los céntimos deben ser enteros, recibido: ${n}`);
  }
  return n as Centimos;
};

/**
 * Convierte un importe en formato español ("1.234.567,89 €", "12,50", "No consta")
 * a céntimos. Devuelve null si no hay un número reconocible, que es un caso
 * habitual y esperado en los anuncios del BOE.
 */
export function parseImporteES(raw: string | null | undefined): Centimos | null {
  if (!raw) return null;

  const limpio = raw.replace(/[^\d.,-]/g, '').trim();
  if (limpio === '' || limpio === '-') return null;

  /* Sin un solo dígito no hay importe. Sin esta comprobación un texto como
     "Ver certificación de cargas." dejaba el residuo "." que, al quitar los
     puntos, se queda en "" — y Number("") es 0. Es decir: "consúltalo" acababa
     guardado como "cero euros de cargas", justo la lectura contraria. */
  if (!/\d/.test(limpio)) return null;

  // Formato español: '.' separa miles, ',' separa decimales.
  const normalizado = limpio.replace(/\./g, '').replace(',', '.');

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return null;

  return centimos(Math.round(valor * 100));
}

/**
 * Como parseImporteES, pero solo acepta que TODO el texto sea un importe.
 *
 * Para campos que unas veces traen una cifra y otras prosa, como las cargas del
 * Portal. `parseImporteES` borra los caracteres no numéricos y pega los dígitos
 * que quedan, lo cual está bien en una celda que ya es un importe pero es
 * desastroso sobre texto libre: de
 *
 *   "Prohibición de disponer ... D.P. 1162/2019 ... año 2025"
 *
 * salían 2.025.311.622.019 € juntando el expediente, el juzgado y las fechas.
 * Aquí, si el campo no es exactamente una cifra, se devuelve null — que
 * significa "no consta" y es lo honesto.
 */
const SOLO_IMPORTE = /^\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:€|EUR|euros?)?\s*\.?\s*$/i;

export function parseImporteEstricto(raw: string | null | undefined): Centimos | null {
  if (!raw) return null;
  const m = SOLO_IMPORTE.exec(raw.replace(/ /g, ' '));
  if (!m) return null;

  const enteros = m[1]!.replace(/\./g, '');
  const decimales = (m[2] ?? '').padEnd(2, '0');

  const valor = Number(`${enteros}.${decimales}`);
  return Number.isFinite(valor) ? centimos(Math.round(valor * 100)) : null;
}

export function formatImporteES(valor: Centimos | null): string {
  if (valor === null) return 'No consta';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(valor / 100);
}
