import { abrirBd } from './index';

/**
 * Ajustes sueltos, clave/valor.
 *
 * Para lo que el usuario cambia desde la web y tiene que sobrevivir al proceso:
 * a qué correo enviar los avisos, si el push está activado, las claves VAPID.
 * Las **credenciales de servicios externos** (SMTP) siguen en `.env`, que es su
 * sitio; aquí solo van preferencias y claves generadas por el propio proyecto.
 */

export function leerAjuste(clave: string): string | null {
  const f = abrirBd().prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave) as
    | { valor: string | null }
    | undefined;
  return f?.valor ?? null;
}

export function guardarAjuste(clave: string, valor: string | null): void {
  abrirBd()
    .prepare(
      `INSERT INTO ajustes (clave, valor, guardado_en) VALUES (?,?,?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor,
                                        guardado_en = excluded.guardado_en`,
    )
    .run(clave, valor, new Date().toISOString());
}

export const leerBooleano = (clave: string, porDefecto = false): boolean => {
  const v = leerAjuste(clave);
  return v === null ? porDefecto : v === '1';
};

export const guardarBooleano = (clave: string, valor: boolean): void =>
  guardarAjuste(clave, valor ? '1' : '0');

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------

/**
 * Dónde queda el resultado del último intento de envío, para que la página de
 * ajustes lo enseñe. Vive aquí, y no junto a las acciones de la web, porque un
 * fichero `'use server'` solo puede exportar funciones async.
 */
export const CLAVE_ULTIMO_AVISO = 'aviso.ultimo_resultado';

export interface PreferenciasAviso {
  /** Enviar los avisos por correo. */
  correo: boolean;
  /** Destinatario. Sin él, el correo no se envía por mucho que esté activado. */
  correoDestino: string | null;
  /** Enviar los avisos como notificación push a los navegadores suscritos. */
  push: boolean;
}

export function preferenciasAviso(): PreferenciasAviso {
  return {
    correo: leerBooleano('aviso.correo'),
    correoDestino: leerAjuste('aviso.correo.destino'),
    push: leerBooleano('aviso.push'),
  };
}

export function guardarPreferenciasAviso(p: PreferenciasAviso): void {
  guardarBooleano('aviso.correo', p.correo);
  guardarAjuste('aviso.correo.destino', p.correoDestino?.trim() || null);
  guardarBooleano('aviso.push', p.push);
}

/**
 * Dirección desde la que se llega a esta web. Va en los enlaces de los avisos,
 * así que `localhost` solo sirve si se leen en el mismo ordenador: al abrirlo en
 * el móvil hay que poner aquí la dirección por la que se entra de verdad.
 */
export function urlWeb(): string {
  const guardada = leerAjuste('web.url')?.trim();
  return (guardada || process.env.WEB_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export const guardarUrlWeb = (url: string): void =>
  guardarAjuste('web.url', url.trim().replace(/\/+$/, '') || null);

// ---------------------------------------------------------------------------
// Claves VAPID
// ---------------------------------------------------------------------------

export interface ClavesVapid {
  publica: string;
  privada: string;
}

/**
 * ⚠️ Las claves VAPID **no deben cambiar nunca**: identifican a este servidor
 * ante el servicio de push del navegador, y cada suscripción queda atada a la
 * pública con la que se creó. Regenerarlas deja mudas todas las suscripciones
 * existentes y hay que volver a dar permiso en cada dispositivo. Por eso se
 * guardan la primera vez y ya no se tocan.
 */
export function clavesVapid(): ClavesVapid | null {
  const publica = leerAjuste('push.vapid.publica');
  const privada = leerAjuste('push.vapid.privada');
  return publica && privada ? { publica, privada } : null;
}

export function guardarClavesVapid(claves: ClavesVapid): void {
  guardarAjuste('push.vapid.publica', claves.publica);
  guardarAjuste('push.vapid.privada', claves.privada);
}
