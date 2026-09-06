import { abrirBd } from './index';
import { listarCatalogo, type FiltrosCatalogo } from './consultas';

/**
 * Alertas guardadas. Una alerta es un conjunto de criterios; al evaluarla se
 * generan avisos por cada subasta que encaja y aún no se había avisado.
 *
 * La deduplicación es (alerta, subasta, motivo) en la propia tabla: así el
 * evaluador puede correr tantas veces como quiera sin repetir avisos.
 */

export interface Alerta {
  id: number;
  nombre: string;
  activa: boolean;
  provincia: string | null;
  texto: string | null;
  tipo: string | null;
  precioMin: number | null;
  precioMax: number | null;
  superficieMin: number | null;
  superficieMax: number | null;
  anioMin: number | null;
  descuentoMin: number | null;
  sinCargas: boolean;
  soloActivas: boolean;
  creadaEn: string;
  ultimaRevisionEn: string | null;
}

export type AlertaNueva = Omit<Alerta, 'id' | 'creadaEn' | 'ultimaRevisionEn'>;

const aAlerta = (f: Record<string, unknown>): Alerta => ({
  id: f.id as number,
  nombre: f.nombre as string,
  activa: Boolean(f.activa),
  provincia: (f.provincia as string) ?? null,
  texto: (f.texto as string) ?? null,
  tipo: (f.tipo as string) ?? null,
  precioMin: (f.precio_min as number) ?? null,
  precioMax: (f.precio_max as number) ?? null,
  superficieMin: (f.superficie_min as number) ?? null,
  superficieMax: (f.superficie_max as number) ?? null,
  anioMin: (f.anio_min as number) ?? null,
  descuentoMin: (f.descuento_min as number) ?? null,
  sinCargas: Boolean(f.sin_cargas),
  soloActivas: Boolean(f.solo_activas),
  creadaEn: f.creada_en as string,
  ultimaRevisionEn: (f.ultima_revision_en as string) ?? null,
});

export function listarAlertas(): Alerta[] {
  return (
    abrirBd()
      .prepare('SELECT * FROM alertas ORDER BY activa DESC, creada_en DESC')
      .all() as Array<Record<string, unknown>>
  ).map(aAlerta);
}

export function obtenerAlerta(id: number): Alerta | null {
  const f = abrirBd().prepare('SELECT * FROM alertas WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return f ? aAlerta(f) : null;
}

export function crearAlerta(a: AlertaNueva): number {
  const res = abrirBd()
    .prepare(
      `INSERT INTO alertas (
         nombre, activa, provincia, texto, tipo, precio_min, precio_max,
         superficie_min, superficie_max, anio_min, descuento_min,
         sin_cargas, solo_activas, creada_en
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      a.nombre,
      a.activa ? 1 : 0,
      a.provincia,
      a.texto,
      a.tipo,
      a.precioMin,
      a.precioMax,
      a.superficieMin,
      a.superficieMax,
      a.anioMin,
      a.descuentoMin,
      a.sinCargas ? 1 : 0,
      a.soloActivas ? 1 : 0,
      new Date().toISOString(),
    );

  return Number(res.lastInsertRowid);
}

export function borrarAlerta(id: number): void {
  abrirBd().prepare('DELETE FROM alertas WHERE id = ?').run(id);
}

export function alternarAlerta(id: number): void {
  abrirBd().prepare('UPDATE alertas SET activa = NOT activa WHERE id = ?').run(id);
}

/** Traduce los criterios guardados a los filtros del catálogo. */
export function filtrosDeAlerta(a: Alerta): FiltrosCatalogo {
  return {
    texto: a.texto ?? undefined,
    provincia: a.provincia ?? undefined,
    tipo: a.tipo ?? undefined,
    estado: a.soloActivas ? 'CELEBRANDOSE' : undefined,
    precioMin: a.precioMin ?? undefined,
    precioMax: a.precioMax ?? undefined,
    superficieMin: a.superficieMin ?? undefined,
    superficieMax: a.superficieMax ?? undefined,
    anioMin: a.anioMin ?? undefined,
    descuentoMin: a.descuentoMin ?? undefined,
    sinCargas: a.sinCargas || undefined,
    soloConFicha: true, // sin ficha no hay importes que comparar
    limite: 200,
  };
}

export interface Aviso {
  id: number;
  alertaId: number;
  alertaNombre: string;
  subastaId: string;
  motivo: string;
  detalle: string | null;
  generadoEn: string;
  visto: boolean;
}

export function avisosPendientes(limite = 50): Aviso[] {
  return (
    abrirBd()
      .prepare(
        `SELECT v.id, v.alerta_id AS alertaId, a.nombre AS alertaNombre,
                v.subasta_id AS subastaId, v.motivo, v.detalle,
                v.generado_en AS generadoEn, v.visto
         FROM avisos v JOIN alertas a ON a.id = v.alerta_id
         WHERE v.visto = 0
         ORDER BY v.generado_en DESC LIMIT ?`,
      )
      .all(limite) as Array<Record<string, unknown>>
  ).map((f) => ({ ...f, visto: Boolean(f.visto) })) as Aviso[];
}

export function contarAvisosPendientes(): number {
  const f = abrirBd()
    .prepare('SELECT COUNT(*) AS n FROM avisos WHERE visto = 0')
    .get() as { n: number };
  return f.n;
}

export function marcarAvisosVistos(ids?: number[]): void {
  const db = abrirBd();
  if (!ids || ids.length === 0) {
    db.prepare('UPDATE avisos SET visto = 1 WHERE visto = 0').run();
    return;
  }
  const stmt = db.prepare('UPDATE avisos SET visto = 1 WHERE id = ?');
  for (const id of ids) stmt.run(id);
}

/**
 * Evalúa una alerta y registra los avisos nuevos.
 * Devuelve cuántos avisos se han generado en esta pasada.
 */
export function evaluarAlerta(alerta: Alerta): number {
  const db = abrirBd();
  const coincidencias = listarCatalogo(filtrosDeAlerta(alerta));

  const insertar = db.prepare(
    `INSERT OR IGNORE INTO avisos (alerta_id, subasta_id, motivo, detalle, generado_en)
     VALUES (?,?,?,?,?)`,
  );

  const ahora = new Date().toISOString();
  let nuevos = 0;

  for (const c of coincidencias) {
    const detalle = [
      c.direccion ?? c.tituloBoe,
      c.localidad,
      c.valorSubasta !== null ? `${(c.valorSubasta / 100).toFixed(0)} €` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const res = insertar.run(alerta.id, c.subastaId, 'NUEVA', detalle, ahora);
    if (res.changes > 0) nuevos++;
  }

  db.prepare('UPDATE alertas SET ultima_revision_en = ? WHERE id = ?').run(
    ahora,
    alerta.id,
  );

  return nuevos;
}

export function evaluarTodas(): { alertas: number; avisos: number } {
  const activas = listarAlertas().filter((a) => a.activa);
  let avisos = 0;
  for (const a of activas) avisos += evaluarAlerta(a);
  return { alertas: activas.length, avisos };
}
