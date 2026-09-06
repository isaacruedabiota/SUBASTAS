import { preferenciasAviso, urlWeb } from '@subastas/db/ajustes';
import {
  avisosPorNotificar,
  contarSuscripciones,
  marcarAvisosNotificados,
  type AvisoPorEnviar,
} from '@subastas/db/notificaciones';
import { enviarCorreo, smtpConfigurado } from './correo';
import { enviarPush } from './push';

/**
 * Saca los avisos de alertas de la web y los manda al correo y al móvil.
 *
 * **Un envío por tanda, no uno por aviso.** Una precarga puede generar decenas
 * de coincidencias de golpe; mandar un correo por cada una sería una avalancha
 * inútil. Se agrupan en un resumen y en una sola notificación.
 *
 * **Marcar como enviado es lo que evita repetir.** Se hace solo si alguna vía
 * ha funcionado: si fallan todas, los avisos siguen pendientes y el siguiente
 * intento los recoge. Dar por enviado lo que no salió sería perderlo en
 * silencio, que es exactamente lo que este proyecto no hace con los datos.
 */

export interface ResumenNotificacion {
  avisos: number;
  correo: 'enviado' | 'desactivado' | 'sin-configurar' | 'error';
  push: 'enviado' | 'desactivado' | 'sin-dispositivos' | 'error';
  dispositivos: number;
  error?: string;
}

const plural = (n: number, uno: string, varios: string): string =>
  `${n} ${n === 1 ? uno : varios}`;

function asunto(avisos: AvisoPorEnviar[]): string {
  if (avisos.length === 1) {
    const a = avisos[0]!;
    return `Subastas · ${a.alertaNombre}: ${a.detalle ?? a.subastaId}`;
  }
  return `Subastas · ${plural(avisos.length, 'coincidencia nueva', 'coincidencias nuevas')}`;
}

function cuerpoTexto(avisos: AvisoPorEnviar[], base: string): string {
  const lineas = avisos.map(
    (a) =>
      `· [${a.alertaNombre}] ${a.detalle ?? a.subastaId}\n  ${base}/subasta/${a.subastaId}`,
  );
  return `${plural(avisos.length, 'subasta encaja', 'subastas encajan')} con tus alertas:\n\n${lineas.join(
    '\n\n',
  )}\n\nVer todas: ${base}/alertas\n`;
}

const escapar = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cuerpoHtml(avisos: AvisoPorEnviar[], base: string): string {
  const filas = avisos
    .map(
      (a) => `<li style="margin:0 0 14px">
  <a href="${base}/subasta/${a.subastaId}" style="color:#1d4ed8;text-decoration:none;font-weight:600">
    ${escapar(a.detalle ?? a.subastaId)}
  </a>
  <div style="color:#5b6472;font-size:13px;margin-top:2px">
    ${escapar(a.alertaNombre)} · ${a.subastaId}
  </div>
</li>`,
    )
    .join('\n');

  return `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#0d1117;line-height:1.5">
  <p>${plural(avisos.length, 'subasta encaja', 'subastas encajan')} con tus alertas:</p>
  <ul style="padding-left:18px">${filas}</ul>
  <p style="font-size:13px;color:#5b6472">
    <a href="${base}/alertas" style="color:#1d4ed8">Ver todas las alertas</a>
  </p>
</div>`;
}

export async function notificarPendientes(limite = 50): Promise<ResumenNotificacion> {
  const prefs = preferenciasAviso();
  const dispositivos = contarSuscripciones();

  const avisos = avisosPorNotificar(limite);
  if (avisos.length === 0) {
    return {
      avisos: 0,
      correo: prefs.correo ? 'enviado' : 'desactivado',
      push: prefs.push ? 'enviado' : 'desactivado',
      dispositivos,
    };
  }

  const base = urlWeb();
  const errores: string[] = [];
  let alguna = false;

  // ------------------------------ correo ------------------------------
  let correo: ResumenNotificacion['correo'] = 'desactivado';
  if (prefs.correo) {
    if (!smtpConfigurado() || !prefs.correoDestino) {
      correo = 'sin-configurar';
    } else {
      try {
        await enviarCorreo({
          para: prefs.correoDestino,
          asunto: asunto(avisos),
          texto: cuerpoTexto(avisos, base),
          html: cuerpoHtml(avisos, base),
        });
        correo = 'enviado';
        alguna = true;
      } catch (e) {
        correo = 'error';
        errores.push(`correo: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // ------------------------------- push -------------------------------
  let push: ResumenNotificacion['push'] = 'desactivado';
  if (prefs.push) {
    if (dispositivos === 0) {
      push = 'sin-dispositivos';
    } else {
      try {
        const uno = avisos.length === 1 ? avisos[0]! : null;
        const r = await enviarPush({
          titulo: uno
            ? uno.alertaNombre
            : plural(avisos.length, 'subasta nueva', 'subastas nuevas'),
          cuerpo: uno
            ? (uno.detalle ?? uno.subastaId)
            : 'Encajan con tus alertas. Toca para verlas.',
          url: uno ? `${base}/subasta/${uno.subastaId}` : `${base}/alertas`,
          etiqueta: 'avisos',
        });
        push = r.enviados > 0 ? 'enviado' : 'error';
        if (r.enviados > 0) alguna = true;
        else errores.push(`push: ningún dispositivo aceptó el aviso`);
      } catch (e) {
        push = 'error';
        errores.push(`push: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  if (alguna) marcarAvisosNotificados(avisos.map((a) => a.id));

  return {
    avisos: avisos.length,
    correo,
    push,
    dispositivos,
    error: errores.length > 0 ? errores.join(' · ') : undefined,
  };
}

export { enviarCorreo, probarSmtp, smtpConfigurado, configSmtp } from './correo';
export { enviarPush, asegurarClavesVapid } from './push';
