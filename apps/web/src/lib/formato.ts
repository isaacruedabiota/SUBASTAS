/** Formateo para la interfaz. Los importes llegan en céntimos enteros. */

export function eur(centimos: number | null | undefined): string {
  if (centimos === null || centimos === undefined) return 'No consta';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(centimos / 100);
}

/**
 * Sin céntimos pero SIEMPRE con separador de miles.
 *
 * El español no agrupa los números de cuatro cifras, así que `eur()` deja
 * "9318 €" junto a "41.920 €" y en una línea de importes se lee fatal. Es la
 * misma razón que en `eurExacto`.
 */
export function eurCorto(centimos: number | null | undefined): string {
  if (centimos === null || centimos === undefined) return 'No consta';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    useGrouping: 'always',
  }).format(centimos / 100);
}

export function eurExacto(centimos: number | null | undefined): string {
  if (centimos === null || centimos === undefined) return 'No consta';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    // El español no agrupa los números de 4 cifras, pero en una tabla de
    // importes deja "2371,06 €" junto a "47.421,39 €" y se lee mal.
    useGrouping: 'always',
  }).format(centimos / 100);
}

export function metros(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined || m2 === 0) return '—';
  return `${new Intl.NumberFormat('es-ES').format(m2)} m²`;
}

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(d);
}

/** Sin hora: para listados, donde el minuto exacto es ruido. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(d);
}

export function diasRestantes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const fin = Date.parse(iso);
  if (Number.isNaN(fin)) return null;
  return Math.ceil((fin - Date.now()) / 86_400_000);
}

/**
 * Descuento del valor de salida respecto a la tasación. Es el primer número que
 * se mira en una subasta, pero no dice nada del riesgo: hay que leerlo junto a
 * las cargas.
 */
export function descuento(
  tasacion: number | null,
  valorSubasta: number | null,
): number | null {
  if (!tasacion || !valorSubasta || tasacion <= 0) return null;
  return (1 - valorSubasta / tasacion) * 100;
}

/** Porcentaje con coma decimal: `toFixed()` produce el punto anglosajón. */
export function porcentaje(valor: number, decimales = 0): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor / 100);
}

/**
 * Ojo: en el Portal, la ausencia de dato NO significa "libre de cargas", solo
 * que la autoridad gestora no lo informó. La interfaz nunca debe decir "sin
 * cargas" cuando el valor es null.
 */
export function oNoConsta(valor: string | null | undefined): string {
  const v = valor?.trim();
  return v && v.length > 0 ? v : 'No consta';
}

export const ETIQUETA_ESTADO: Record<string, string> = {
  CELEBRANDOSE: 'Celebrándose',
  CONCLUIDA: 'Concluida',
  PROXIMA_APERTURA: 'Próxima apertura',
  SUSPENDIDA: 'Suspendida',
  CANCELADA: 'Cancelada',
};

/* Aquí vivía COLOR_ESTADO, con colores sueltos de Tailwind (`text-emerald-400`)
   pensados solo para fondo oscuro. Nadie lo usaba —el color del estado sale de
   <Estado> con tokens— y ahora que el tema se puede cambiar habría dado texto
   verde claro sobre blanco. Los colores van en `globals.css` y en ningún otro
   sitio. */
