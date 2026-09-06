import webpush from 'web-push';
import { clavesVapid, guardarClavesVapid, type ClavesVapid } from '@subastas/db/ajustes';
import {
  borrarSuscripcion,
  listarSuscripciones,
  marcarSuscripcionUsada,
  registrarErrorSuscripcion,
} from '@subastas/db/notificaciones';

/**
 * Notificaciones push al móvil, por Web Push.
 *
 * **Por qué esto y no la app de Expo.** Web Push no necesita cuenta, ni tarjeta,
 * ni tienda de aplicaciones: el navegador se suscribe, el servidor firma con un
 * par de claves que se genera él solo (VAPID) y el mensaje llega aunque la web
 * esté cerrada. Encaja con "sin servicios cloud" mejor que cualquier alternativa
 * y funciona hoy, sin publicar nada.
 *
 * **⚠️ Requisitos que sorprenden:**
 *
 * - Hace falta **HTTPS**. Los service workers solo arrancan en contexto seguro;
 *   `localhost` está exento, pero `http://192.168.1.x` NO. Es la razón de fondo
 *   para servir la web por Tailscale (o cualquier otro HTTPS) si se quieren
 *   avisos en el móvil.
 * - En **iOS** solo llegan si la web se ha añadido a la pantalla de inicio
 *   ("Añadir a inicio"): Safari no admite push desde una pestaña normal.
 * - El contenido va cifrado extremo a extremo con las claves de la suscripción:
 *   Google y Apple transportan el aviso sin poder leerlo.
 */

/** Contacto obligatorio en VAPID: identifica a quién reclamar si algo va mal. */
const CONTACTO = process.env.PUSH_CONTACTO ?? 'mailto:subastas@localhost';

/**
 * Claves VAPID, generándolas la primera vez.
 *
 * ⚠️ Se generan **una sola vez y no se tocan más**: cada suscripción queda atada
 * a la clave pública con la que se creó, así que regenerarlas deja mudos todos
 * los dispositivos y hay que volver a dar permiso en cada uno.
 */
export function asegurarClavesVapid(): ClavesVapid {
  const guardadas = clavesVapid();
  if (guardadas) return guardadas;

  const nuevas = webpush.generateVAPIDKeys();
  const claves = { publica: nuevas.publicKey, privada: nuevas.privateKey };
  guardarClavesVapid(claves);
  return claves;
}

function configurar(): void {
  const { publica, privada } = asegurarClavesVapid();
  webpush.setVapidDetails(CONTACTO, publica, privada);
}

export interface AvisoPush {
  titulo: string;
  cuerpo: string;
  /** A dónde lleva el toque en la notificación. */
  url?: string;
  /** Agrupa notificaciones: una nueva con la misma etiqueta sustituye a la anterior. */
  etiqueta?: string;
}

export interface ResultadoPush {
  enviados: number;
  caducados: number;
  fallidos: number;
}

/**
 * Envía a todos los dispositivos suscritos.
 *
 * ⚠️ Un 404 o un 410 significan que esa suscripción está muerta **para
 * siempre** (el usuario desinstaló, revocó el permiso o el navegador la rotó).
 * Se borra en el acto: reintentarla es tráfico perdido y ensucia el recuento.
 */
export async function enviarPush(aviso: AvisoPush): Promise<ResultadoPush> {
  const suscripciones = listarSuscripciones();
  if (suscripciones.length === 0) return { enviados: 0, caducados: 0, fallidos: 0 };

  configurar();

  const carga = JSON.stringify(aviso);
  let enviados = 0;
  let caducados = 0;
  let fallidos = 0;

  for (const s of suscripciones) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        carga,
      );
      marcarSuscripcionUsada(s.id);
      enviados++;
    } catch (e) {
      const estado = (e as { statusCode?: number }).statusCode;
      if (estado === 404 || estado === 410) {
        borrarSuscripcion(s.id);
        caducados++;
      } else {
        registrarErrorSuscripcion(s.id, e instanceof Error ? e.message : String(e));
        fallidos++;
      }
    }
  }

  return { enviados, caducados, fallidos };
}
