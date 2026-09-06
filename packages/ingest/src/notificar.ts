import './entorno';
import { preferenciasAviso } from '@subastas/db/ajustes';
import {
  contarSuscripciones,
  listarSuscripciones,
  silenciarAtrasados,
} from '@subastas/db/notificaciones';
import { enviarPush, notificarPendientes, probarSmtp, smtpConfigurado } from './notificaciones';

/**
 * Envía los avisos de alertas que estén pendientes.
 *
 *   npm run notificar                 # envía lo pendiente
 *   npm run notificar -- --probar     # prueba las vías sin tocar los avisos
 *   npm run notificar -- --silenciar  # da por enviado lo atrasado, sin mandarlo
 *
 * `npm run alertas` ya lo llama al terminar; esto está para cron y para probar.
 */

const tiene = (n: string): boolean => process.argv.includes(`--${n}`);

/**
 * Comprueba las dos vías sin tocar los avisos pendientes: el SMTP solo se
 * verifica (no manda nada) y el push sí envía una notificación de prueba, que es
 * la única forma de saber si llega al dispositivo.
 */
async function probar(): Promise<void> {
  if (!smtpConfigurado()) {
    console.log('· correo: sin configurar (faltan SMTP_HOST, SMTP_USUARIO o SMTP_CLAVE).');
  } else {
    try {
      await probarSmtp();
      console.log('· correo: el servidor SMTP acepta las credenciales.');
    } catch (e) {
      console.log(`· correo: ${e instanceof Error ? e.message : e}`);
    }
  }

  const dispositivos = listarSuscripciones();
  if (dispositivos.length === 0) {
    console.log('· push: ningún dispositivo dado de alta (se hace desde /ajustes).');
    return;
  }

  const r = await enviarPush({
    titulo: 'Subastas',
    cuerpo: 'Prueba de aviso. Si ves esto, las notificaciones funcionan.',
    etiqueta: 'prueba',
  });
  console.log(
    `· push: ${r.enviados} enviado(s), ${r.caducados} caducado(s), ${r.fallidos} con error` +
      ` (de ${dispositivos.length} dispositivo(s)).`,
  );
  for (const s of listarSuscripciones()) {
    if (s.ultimoError) console.log(`    ${s.etiqueta ?? s.id}: ${s.ultimoError}`);
  }
}

async function main(): Promise<void> {
  if (tiene('probar')) {
    await probar();
    return;
  }

  if (tiene('silenciar')) {
    const n = silenciarAtrasados();
    console.log(`${n} aviso(s) atrasado(s) marcados como enviados, sin enviarlos.`);
    return;
  }

  const prefs = preferenciasAviso();
  if (!prefs.correo && !prefs.push) {
    console.log(
      'Las notificaciones están desactivadas. Actívalas en la web, en /ajustes.',
    );
    return;
  }

  const r = await notificarPendientes();

  if (r.avisos === 0) {
    console.log('No hay avisos pendientes de enviar.');
  } else {
    console.log(
      `${r.avisos} aviso(s) · correo: ${r.correo} · push: ${r.push} (${contarSuscripciones()} dispositivo(s))`,
    );
  }
  if (r.error) console.error(`\n⚠️ ${r.error}`);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
