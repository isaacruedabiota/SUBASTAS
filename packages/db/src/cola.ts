import { abrirBd } from './index';

/**
 * Cola de fichas del Portal pendientes de leer.
 *
 * No es una cola que se rellena a mano: se deduce del catálogo (subastas que el
 * BOE conoce pero cuya ficha aún no se ha leído). La tabla `cola_portal` solo
 * guarda los intentos fallidos, para no reintentar en bucle una que da error.
 */

const MAX_INTENTOS = 3;

/**
 * Hoy en **`YYYYMMDD`**, que es como el BOE fecha sus anuncios y como se guarda
 * `anuncios_boe.fecha_publicacion` — sin guiones.
 *
 * ⚠️ Usar el ISO normal (`2026-08-01`) aquí no da error, da lo contrario de lo
 * que se pide, y en silencio: comparando cadenas, `'20260613' >= '2026-08-01'`
 * es CIERTO, porque en la quinta posición el `'0'` (48) es mayor que el `'-'`
 * (45). Con eso, las 2.822 subastas atrasadas se clasificaban como "nuevas" y la
 * precarga se quedaba sin nada que hacer.
 */
export const hoy = (): string => new Date().toISOString().slice(0, 10).replace(/-/g, '');

/**
 * Pendientes, las más recientes primero: una subasta se publica en el BOE poco
 * antes de abrirse y dura unos 20 días, así que lo reciente es lo que sigue
 * activo y lo que de verdad interesa tener al día.
 *
 * El catálogo se lee en dos regímenes distintos, y por eso el filtro por fecha
 * de anuncio:
 *
 * - **`antesDe: hoy()`** — el atrasado. Lectura completa con `npm run precargar`,
 *   que es un recorrido sistemático y va deliberadamente lento.
 * - **`desde: hoy()`** — lo que va llegando. Lectura básica con
 *   `npm run basicas`: dos pestañas por subasta, y el resto solo si el usuario
 *   abre esa ficha.
 */
export function pendientesDePrecarga(
  limite = 50,
  filtro: { antesDe?: string; desde?: string } = {},
): string[] {
  const cond: string[] = [
    's.identificador IS NULL',
    'COALESCE(q.intentos, 0) < ?',
  ];
  const params: unknown[] = [MAX_INTENTOS];

  if (filtro.antesDe) {
    cond.push('b.fecha_publicacion < ?');
    params.push(filtro.antesDe);
  }
  if (filtro.desde) {
    cond.push('b.fecha_publicacion >= ?');
    params.push(filtro.desde);
  }

  const filas = abrirBd()
    .prepare(
      `SELECT DISTINCT a.subasta_id AS id
       FROM anuncio_subastas a
       JOIN anuncios_boe b  ON b.identificador = a.anuncio_id
       LEFT JOIN subastas s ON s.identificador = a.subasta_id
       LEFT JOIN cola_portal q ON q.subasta_id = a.subasta_id
       WHERE ${cond.join(' AND ')}
       ORDER BY b.fecha_publicacion DESC
       LIMIT ?`,
    )
    .all(...(params as never[]), limite) as Array<{ id: string }>;

  return filas.map((f) => f.id);
}

export function registrarFallo(subastaId: string, error: string): void {
  abrirBd()
    .prepare(
      `INSERT INTO cola_portal (subasta_id, intentos, ultimo_error, ultimo_intento)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(subasta_id) DO UPDATE SET
         intentos       = intentos + 1,
         ultimo_error   = excluded.ultimo_error,
         ultimo_intento = excluded.ultimo_intento`,
    )
    .run(subastaId, error.slice(0, 300), new Date().toISOString());
}

export function limpiarDeCola(subastaId: string): void {
  abrirBd().prepare('DELETE FROM cola_portal WHERE subasta_id = ?').run(subastaId);
}

export function estadoCola(): {
  pendientes: number;
  /** De las pendientes, las anunciadas antes de hoy: van a `precargar`. */
  atrasadas: number;
  /** Las anunciadas hoy o después: van a `basicas`. */
  nuevas: number;
  leidas: number;
  /** Leídas solo en lo básico; se completan al abrir la ficha. */
  basicas: number;
  fallidas: number;
} {
  const db = abrirBd();
  const uno = (sql: string, ...p: unknown[]) =>
    (db.prepare(sql).get(...(p as never[])) as { n: number }).n;

  const pendientesCon = (extra: string, ...p: unknown[]) =>
    uno(
      `SELECT COUNT(DISTINCT a.subasta_id) AS n
       FROM anuncio_subastas a
       JOIN anuncios_boe b  ON b.identificador = a.anuncio_id
       LEFT JOIN subastas s ON s.identificador = a.subasta_id
       LEFT JOIN cola_portal q ON q.subasta_id = a.subasta_id
       WHERE s.identificador IS NULL AND COALESCE(q.intentos, 0) < ? ${extra}`,
      MAX_INTENTOS,
      ...p,
    );

  return {
    pendientes: pendientesCon(''),
    atrasadas: pendientesCon('AND b.fecha_publicacion < ?', hoy()),
    nuevas: pendientesCon('AND b.fecha_publicacion >= ?', hoy()),
    leidas: uno('SELECT COUNT(*) AS n FROM subastas'),
    basicas: uno("SELECT COUNT(*) AS n FROM subastas WHERE lectura = 'BASICA'"),
    fallidas: uno('SELECT COUNT(*) AS n FROM cola_portal WHERE intentos >= ?', MAX_INTENTOS),
  };
}
