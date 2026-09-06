import { abrirBd } from './index';

/**
 * Suscripciones de Web Push y control de qué avisos se han enviado ya.
 *
 * Una suscripción es un navegador concreto que ha aceptado recibir
 * notificaciones. El `endpoint` lo da el propio navegador (Google en Android,
 * Apple en iOS/Safari) y es su identidad; las dos claves cifran el mensaje, de
 * forma que el servicio de push transporta el aviso sin poder leerlo.
 */

export interface SuscripcionPush {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  etiqueta: string | null;
  creadaEn: string;
  ultimoUsoEn: string | null;
  ultimoError: string | null;
}

const aSuscripcion = (f: Record<string, unknown>): SuscripcionPush => ({
  id: f.id as number,
  endpoint: f.endpoint as string,
  p256dh: f.p256dh as string,
  auth: f.auth as string,
  etiqueta: (f.etiqueta as string) ?? null,
  creadaEn: f.creada_en as string,
  ultimoUsoEn: (f.ultimo_uso_en as string) ?? null,
  ultimoError: (f.ultimo_error as string) ?? null,
});

export function listarSuscripciones(): SuscripcionPush[] {
  return (
    abrirBd()
      .prepare('SELECT * FROM suscripciones_push ORDER BY creada_en')
      .all() as Array<Record<string, unknown>>
  ).map(aSuscripcion);
}

export function contarSuscripciones(): number {
  const f = abrirBd()
    .prepare('SELECT COUNT(*) AS n FROM suscripciones_push')
    .get() as { n: number };
  return f.n;
}

/**
 * Alta o refresco. El navegador puede renovar las claves de una suscripción
 * conservando el endpoint, así que el `ON CONFLICT` las actualiza en vez de
 * fallar: si no, un endpoint renovado quedaría con las claves viejas y sus
 * mensajes dejarían de descifrarse en silencio.
 */
export function guardarSuscripcion(s: {
  endpoint: string;
  p256dh: string;
  auth: string;
  etiqueta?: string | null;
}): void {
  abrirBd()
    .prepare(
      `INSERT INTO suscripciones_push (endpoint, p256dh, auth, etiqueta, creada_en)
       VALUES (?,?,?,?,?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh       = excluded.p256dh,
         auth         = excluded.auth,
         etiqueta     = COALESCE(excluded.etiqueta, suscripciones_push.etiqueta),
         ultimo_error = NULL`,
    )
    .run(
      s.endpoint,
      s.p256dh,
      s.auth,
      s.etiqueta?.trim() || null,
      new Date().toISOString(),
    );
}

export function borrarSuscripcion(idOEndpoint: number | string): void {
  const db = abrirBd();
  if (typeof idOEndpoint === 'number') {
    db.prepare('DELETE FROM suscripciones_push WHERE id = ?').run(idOEndpoint);
  } else {
    db.prepare('DELETE FROM suscripciones_push WHERE endpoint = ?').run(idOEndpoint);
  }
}

export function marcarSuscripcionUsada(id: number): void {
  abrirBd()
    .prepare(
      'UPDATE suscripciones_push SET ultimo_uso_en = ?, ultimo_error = NULL WHERE id = ?',
    )
    .run(new Date().toISOString(), id);
}

export function registrarErrorSuscripcion(id: number, error: string): void {
  abrirBd()
    .prepare('UPDATE suscripciones_push SET ultimo_error = ? WHERE id = ?')
    .run(error, id);
}

// ---------------------------------------------------------------------------
// Avisos pendientes de enviar
// ---------------------------------------------------------------------------

export interface AvisoPorEnviar {
  id: number;
  alertaNombre: string;
  subastaId: string;
  motivo: string;
  detalle: string | null;
  generadoEn: string;
}

/**
 * Avisos que aún no se han enviado por ninguna vía.
 *
 * ⚠️ El criterio es `notificado_en IS NULL`, **no** `visto = 0`. Son dos hechos
 * distintos: marcar un aviso como visto en la web no debe cancelar su envío, ni
 * enviarlo debe darlo por leído.
 */
export function avisosPorNotificar(limite = 50): AvisoPorEnviar[] {
  return (
    abrirBd()
      .prepare(
        `SELECT v.id, a.nombre AS alertaNombre, v.subasta_id AS subastaId,
                v.motivo, v.detalle, v.generado_en AS generadoEn
           FROM avisos v JOIN alertas a ON a.id = v.alerta_id
          WHERE v.notificado_en IS NULL
          ORDER BY v.generado_en LIMIT ?`,
      )
      .all(limite) as Array<Record<string, unknown>>
  ).map((f) => ({
    id: f.id as number,
    alertaNombre: f.alertaNombre as string,
    subastaId: f.subastaId as string,
    motivo: f.motivo as string,
    detalle: (f.detalle as string) ?? null,
    generadoEn: f.generadoEn as string,
  }));
}

export function marcarAvisosNotificados(ids: number[]): void {
  if (ids.length === 0) return;
  const stmt = abrirBd().prepare('UPDATE avisos SET notificado_en = ? WHERE id = ?');
  const ahora = new Date().toISOString();
  for (const id of ids) stmt.run(ahora, id);
}

/**
 * Da por notificado todo lo que ya existe, sin enviar nada.
 *
 * Hace falta al activar las notificaciones por primera vez: si no, el primer
 * envío soltaría de golpe los cientos de avisos acumulados desde que se creó la
 * alerta. Lo que interesa notificar es lo que llegue **a partir de ahora**.
 */
export function silenciarAtrasados(): number {
  const res = abrirBd()
    .prepare('UPDATE avisos SET notificado_en = ? WHERE notificado_en IS NULL')
    .run(new Date().toISOString());
  return Number(res.changes);
}
