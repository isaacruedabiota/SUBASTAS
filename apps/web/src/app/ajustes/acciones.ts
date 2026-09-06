'use server';

import { revalidatePath } from 'next/cache';
import {
  CLAVE_ULTIMO_AVISO,
  guardarAjuste,
  guardarPreferenciasAviso,
  guardarUrlWeb,
  preferenciasAviso,
} from '@subastas/db/ajustes';
import {
  borrarSuscripcion,
  contarSuscripciones,
  silenciarAtrasados,
} from '@subastas/db/notificaciones';
import { enviarCorreo, enviarPush, smtpConfigurado } from '@subastas/ingest/notificaciones';

/**
 * Ajustes de notificación.
 *
 * Igual que en /cuenta, los fallos no se lanzan: se guardan en un ajuste y la
 * página los enseña. Un `<form action=…>` sin JavaScript no tiene por dónde
 * devolver un mensaje, y reventar con la pantalla de error de Next por un SMTP
 * mal puesto sería desproporcionado.
 */

const anotar = (mensaje: string): void => guardarAjuste(CLAVE_ULTIMO_AVISO, mensaje);

export async function guardarNotificaciones(formData: FormData): Promise<void> {
  const antes = preferenciasAviso();

  const ahora = {
    correo: formData.get('correo') === '1',
    correoDestino: String(formData.get('correoDestino') ?? ''),
    push: formData.get('push') === '1',
  };

  guardarPreferenciasAviso(ahora);
  guardarUrlWeb(String(formData.get('urlWeb') ?? ''));

  /* ⚠️ Al encender las notificaciones por primera vez, lo acumulado NO se
     manda: puede haber cientos de avisos de meses atrás y el primer envío sería
     una avalancha. Se dan por notificados y a partir de aquí llega lo nuevo. */
  const seEnciende = (!antes.correo && ahora.correo) || (!antes.push && ahora.push);
  const eraTodoApagado = !antes.correo && !antes.push;

  if (seEnciende && eraTodoApagado) {
    const n = silenciarAtrasados();
    anotar(
      n > 0
        ? `Notificaciones activadas. Los ${n} aviso(s) que ya había NO se envían: solo llegará lo que aparezca a partir de ahora.`
        : 'Notificaciones activadas.',
    );
  } else {
    anotar('Ajustes guardados.');
  }

  revalidatePath('/ajustes');
}

/** Manda un aviso de prueba por las vías activadas, sin tocar los pendientes. */
export async function enviarPrueba(): Promise<void> {
  const prefs = preferenciasAviso();
  const partes: string[] = [];

  if (!prefs.correo && !prefs.push) {
    anotar('No hay ninguna vía activada: no se ha enviado nada.');
    revalidatePath('/ajustes');
    return;
  }

  if (prefs.correo) {
    if (!smtpConfigurado()) {
      partes.push('correo: falta la configuración SMTP en .env');
    } else if (!prefs.correoDestino) {
      partes.push('correo: falta el destinatario');
    } else {
      try {
        await enviarCorreo({
          para: prefs.correoDestino,
          asunto: 'Subastas · prueba de aviso',
          texto:
            'Si lees esto, los avisos de tus alertas llegarán a este correo.\n\n' +
            'Enviado desde la prueba de /ajustes.',
        });
        partes.push(`correo: enviado a ${prefs.correoDestino}`);
      } catch (e) {
        partes.push(`correo: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  if (prefs.push) {
    if (contarSuscripciones() === 0) {
      partes.push('push: ningún dispositivo activado');
    } else {
      try {
        const r = await enviarPush({
          titulo: 'Subastas',
          cuerpo: 'Prueba de aviso. Si ves esto, las notificaciones funcionan.',
          etiqueta: 'prueba',
        });
        partes.push(
          `push: ${r.enviados} enviado(s)` +
            (r.caducados > 0 ? `, ${r.caducados} caducado(s)` : '') +
            (r.fallidos > 0 ? `, ${r.fallidos} con error` : ''),
        );
      } catch (e) {
        partes.push(`push: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  anotar(`Prueba · ${partes.join(' · ')}`);
  revalidatePath('/ajustes');
}

export async function quitarDispositivo(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  if (Number.isInteger(id)) borrarSuscripcion(id);
  revalidatePath('/ajustes');
}
