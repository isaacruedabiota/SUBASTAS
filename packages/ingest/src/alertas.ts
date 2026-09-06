import './entorno';
import {
  avisosPendientes,
  evaluarTodas,
  listarAlertas,
} from '@subastas/db/alertas';
import { preferenciasAviso } from '@subastas/db/ajustes';
import { notificarPendientes } from './notificaciones';

/**
 * Evalúa todas las alertas activas contra el catálogo y envía lo que salga.
 *
 *   npm run alertas
 *
 * Pensado para lanzarlo tras cada ingesta o precarga, o por cron.
 */

async function main(): Promise<void> {
  const alertas = listarAlertas();
  if (alertas.length === 0) {
    console.log('No hay alertas definidas. Créalas desde la web (/alertas).');
    return;
  }

  const { alertas: revisadas, avisos } = evaluarTodas();
  console.log(`${revisadas} alerta(s) activa(s) revisada(s) → ${avisos} aviso(s) nuevo(s)\n`);

  const pendientes = avisosPendientes(20);
  if (pendientes.length > 0) {
    console.log(`Avisos pendientes (${pendientes.length} mostrados):`);
    for (const a of pendientes) {
      console.log(`  [${a.alertaNombre}] ${a.subastaId}`);
      if (a.detalle) console.log(`      ${a.detalle}`);
    }
  } else {
    console.log('Sin avisos pendientes.');
  }

  // Enviar es un paso aparte de evaluar: el criterio de "ya enviado" no es el
  // mismo que el de "ya visto", y fallar aquí no debe invalidar la evaluación.
  const prefs = preferenciasAviso();
  if (!prefs.correo && !prefs.push) return;

  const r = await notificarPendientes();
  if (r.avisos > 0) {
    console.log(`\nEnviados: correo ${r.correo} · push ${r.push}`);
  }
  if (r.error) console.error(`⚠️ ${r.error}`);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
