import './entorno';
import { createInterface } from 'node:readline/promises';
import { listarCuentas, type CuentaPortal } from '@subastas/db/cuentas';
import {
  enviarCodigo,
  haySesionConfigurada,
  pedirCodigo,
  sesionAbiertaEn,
  usuarioEnSesion,
} from './sources/portal-subastas/sesion';

/**
 * Abre sesión en el Portal para poder ver el importe de la puja en vivo.
 *
 *   npm run entrar                     # interactivo: pide el código por consola
 *   npm run entrar -- --paso1          # solo envía el código y lo deja a medias
 *   npm run entrar -- --codigo ABC123  # completa un --paso1 anterior
 *   npm run entrar -- --cuenta 2       # con varias cuentas, cuál
 *
 * ⚠️ El Portal usa doble factor: manda un código al correo Y al móvil, y **cada
 * intento invalida el código anterior**. Por eso esto no puede ser desatendido.
 *
 * El login a medias y la sesión resultante viven en la BD, así que los dos pasos
 * pueden darse en procesos distintos —o desde la web, en /cuenta— y el resto de
 * comandos ven la sesión sin reiniciarse.
 */

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const tiene = (nombre: string): boolean => process.argv.includes(`--${nombre}`);

/** Cuenta a usar: la indicada, o la única que haya. */
function elegirCuenta(): CuentaPortal {
  const cuentas = listarCuentas();

  if (cuentas.length === 0) {
    throw new Error(
      'No hay ninguna cuenta guardada.\n' +
        'Añádela desde la web (pestaña Cuenta) o pon PORTAL_USUARIO y PORTAL_CLAVE\n' +
        'en .env y vuelve a ejecutar esto: la primera vez se importa sola.',
    );
  }

  const pedida = argumento('cuenta');
  if (pedida) {
    const c = cuentas.find(
      (c) => String(c.id) === pedida || c.usuario === pedida || c.etiqueta === pedida,
    );
    if (!c) throw new Error(`No hay ninguna cuenta "${pedida}".`);
    return c;
  }

  if (cuentas.length > 1) {
    const lista = cuentas.map((c) => `  ${c.id}  ${c.usuario}  (${c.etiqueta})`).join('\n');
    throw new Error(`Hay varias cuentas. Elige una con --cuenta:\n${lista}`);
  }

  return cuentas[0]!;
}

function exito(cuenta: CuentaPortal): void {
  console.log(`
✔ Sesión abierta con ${cuenta.usuario} y guardada en la base de datos.

Ahora las subastas en curso muestran el importe de la puja. Compruébalo con:
  npm run probar-sesion

Cuando caduque, la ficha volverá a decir "hay pujas, importe reservado" —nunca
"sin pujas"— y bastará con repetir: npm run entrar`);
}

async function main(): Promise<void> {
  // Toca la sesión para que la cuenta de `.env` se importe si aún no está.
  haySesionConfigurada();

  const cuenta = elegirCuenta();

  const codigoSuelto = argumento('codigo');
  if (codigoSuelto) {
    if (!cuenta.esperandoCodigo) {
      console.log(
        `La cuenta ${cuenta.usuario} no tiene ningún login a medias.\n` +
          'Ejecuta antes: npm run entrar -- --paso1',
      );
      return;
    }
    await enviarCodigo(cuenta.id, codigoSuelto);
    exito(cuenta);
    return;
  }

  const abierta = sesionAbiertaEn();
  if (abierta) {
    console.log(`Ya hay una sesión guardada (${usuarioEnSesion()}, abierta el ${abierta}).
Si sigue valiendo no hace falta entrar otra vez; si ha caducado, continúa.
`);
  }

  console.log(`Enviando usuario y contraseña al Portal (${cuenta.usuario})...`);
  await pedirCodigo(cuenta.id);
  console.log(`
El Portal ha enviado un código de verificación a tu correo y a tu móvil.
⚠️ Este código anula cualquier otro anterior.`);

  if (tiene('paso1')) {
    console.log(`
Estado guardado. Cuando lo tengas, aquí o en la web:
  npm run entrar -- --codigo <CODIGO>`);
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const codigo = await rl.question('\nCódigo: ');
    await enviarCodigo(cuenta.id, codigo);
    exito(cuenta);
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
});
