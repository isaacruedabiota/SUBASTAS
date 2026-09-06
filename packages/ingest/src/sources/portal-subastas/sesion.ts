/* El `.env` de la raíz, para que la cuenta heredada se pueda importar también
   cuando quien llama es la web y no un script de consola. */
import '../../entorno';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import {
  adoptarCuentaHeredada,
  cerrarSesionCuenta,
  credencialesDe,
  guardarPendiente,
  guardarSesionCuenta,
  leerPendiente,
  obtenerCuenta,
  olvidarPendiente,
  registrarErrorCuenta,
  sesionEnUso,
} from '@subastas/db/cuentas';
import { fetchConCookies } from '../../http';

/**
 * Sesión de usuario registrado en el Portal de Subastas.
 *
 * **Para qué existe.** A un visitante anónimo el Portal le esconde el importe de
 * la puja mientras la subasta está en curso: donde iría la cifra pone «La
 * subasta ha recibido alguna puja. Para ver su importe debe acceder como usuario
 * registrado». No está oculto en el HTML —no se envía—, así que no hay parseo que
 * valga. Con sesión sí aparece:
 *
 *     Importe de la puja más alta en esta subasta: 84.938,88 €
 *
 * **⚠️ El login es de DOS FACTORES.** Tras el usuario y la contraseña, el Portal
 * envía un código por correo Y por SMS y pide un `codVerif`. Cada intento
 * invalida el código anterior: no llamar a `pedirCodigo` en bucle.
 *
 * **Dónde vive el estado.** En la BD (`cuentas_portal`), no en ficheros. Eso es
 * lo que permite que el paso 1 y el paso 2 ocurran en procesos distintos —pedir
 * el código desde el navegador y teclearlo desde donde sea— y que web y CLI
 * compartan la misma sesión sin ponerse de acuerdo.
 *
 * **Qué NO es.** Esto no abre la puerta a rastrear el Portal: sigue habiendo una
 * única función que lee UNA subasta por identificador, y sigue pasando por la
 * cola de `http.ts`. Lo único que cambia es que las peticiones van
 * identificadas, con la cuenta del propio usuario, para ver datos que esa cuenta
 * tiene derecho a ver.
 *
 * **Es opcional.** Sin sesión todo funciona igual y la interfaz no miente: las
 * subastas en curso quedan en `OCULTA` y se muestran como «hay pujas, importe
 * reservado».
 */

const BASE = 'https://subastas.boe.es';
const URL_LOGIN = `${BASE}/id/login.php`;

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

/**
 * Lo que de verdad importa: el Portal está negando el importe.
 *
 * Es la frase exacta del muro, distinta de la caja genérica «Para participar en
 * la subasta debe haberse registrado…», que sale también sin pujas.
 *
 * ⚠️ **No sirve mirar la cabecera.** Lo natural parecía detectar la sesión por
 * el botón «Iniciar sesión» (`botonAcceso`), pero se comprobó contra el Portal
 * real: la clase sigue estando **también con la sesión abierta**. Un reintento
 * basado en ella se habría disparado siempre, convirtiendo cada lectura en dos
 * peticiones y un login.
 */
const MURO_IMPORTE = /ver su importe debe acceder como usuario registrado/i;

/** El Portal ha escondido el importe de la puja tras el registro. */
export function importeReservado(html: string): boolean {
  return MURO_IMPORTE.test(html);
}

/** Marca inequívoca de sesión abierta: el enlace de salir. */
export function tieneSesion(html: string): boolean {
  return /Desconectar/i.test(html);
}

// ---------------------------------------------------------------------------
// Herencia: la cuenta que vivía en .env y la sesión en JSON
// ---------------------------------------------------------------------------

const RUTA_SESION_ANTIGUA =
  process.env.PORTAL_SESION_FICHERO ?? join(RAIZ, 'data/sesion-portal.json');

let adoptado = false;

/**
 * Trae a la BD la cuenta de `.env` y la sesión de `data/sesion-portal.json`, que
 * es donde vivían antes de que se pudieran gestionar varias cuentas.
 *
 * Solo actúa mientras no haya ninguna cuenta guardada: en cuanto la hay, manda
 * la BD y estos dos sitios dejan de mirarse. El fichero antiguo se deja en su
 * sitio a propósito —no se borra nada que no se haya escrito antes en otro
 * lado—, pero ya no se lee.
 */
function adoptarHerencia(): void {
  if (adoptado) return;
  adoptado = true;

  const usuario = process.env.PORTAL_USUARIO?.trim();
  const clave = process.env.PORTAL_CLAVE;
  if (!usuario || !clave) return;

  let cookie: string | null = null;
  let abiertaEn: string | null = null;
  if (existsSync(RUTA_SESION_ANTIGUA)) {
    try {
      const j = JSON.parse(readFileSync(RUTA_SESION_ANTIGUA, 'utf8')) as {
        cookie?: string;
        abiertaEn?: string;
        usuario?: string;
      };
      // Solo si la sesión guardada es de ESA cuenta; si no, es de otra persona.
      if (j.cookie && (!j.usuario || j.usuario === usuario)) {
        cookie = j.cookie;
        abiertaEn = j.abiertaEn ?? null;
      }
    } catch {
      /* fichero corrupto: como si no hubiera sesión */
    }
  }

  adoptarCuentaHeredada({ usuario, clave, cookie, abiertaEn });
}

/**
 * Fuerza la adopción de la cuenta heredada.
 *
 * Lo llama la página de cuentas antes de listar: sin esto, quien tuviera su
 * cuenta en `.env` abriría la web y vería «ninguna cuenta todavía», porque la
 * importación solo se disparaba al pedirle algo al Portal.
 */
export function asegurarCuentas(): void {
  adoptarHerencia();
}

// ---------------------------------------------------------------------------
// Sesión en uso
// ---------------------------------------------------------------------------

/**
 * Cookie para las peticiones al Portal, o null si no hay sesión.
 *
 * **No intenta iniciar sesión**: con doble factor no se puede sin una persona
 * delante. Si no hay sesión se navega anónimo, que es el modo por defecto.
 *
 * No memoiza a propósito: es una lectura trivial de SQLite, y cachearla haría
 * que un servidor web largo siguiera usando una cookie que la consola acaba de
 * renovar.
 */
export async function cookieDeSesion(): Promise<string | null> {
  adoptarHerencia();
  return sesionEnUso()?.cookie ?? null;
}

/** ¿Hay sesión guardada? No garantiza que siga viva. */
export function haySesionConfigurada(): boolean {
  adoptarHerencia();
  return sesionEnUso() !== null;
}

/** Cuándo se abrió la sesión en uso, para poder avisar de que ya tiene años. */
export function sesionAbiertaEn(): string | null {
  adoptarHerencia();
  const s = sesionEnUso();
  return s ? (obtenerCuenta(s.id)?.sesionAbiertaEn ?? null) : null;
}

/** Con qué cuenta se está navegando, para poder decirlo en la interfaz. */
export function usuarioEnSesion(): string | null {
  adoptarHerencia();
  return sesionEnUso()?.usuario ?? null;
}

/**
 * Tira la sesión de la cuenta en uso: caducada o inservible. La siguiente
 * lectura irá anónima.
 *
 * No se reintenta el login: renovarlo exige un código por SMS. Se prefiere
 * guardar lo que ve un anónimo —«hay pujas, importe reservado»— que es la
 * verdad, antes que inventar un «sin pujas».
 */
export function olvidarSesion(): void {
  const s = sesionEnUso();
  if (!s) return;
  cerrarSesionCuenta(s.id);
  registrarErrorCuenta(s.id, 'La sesión caducó: el Portal volvió a esconder el importe.');
}

// ---------------------------------------------------------------------------
// Login en dos pasos
// ---------------------------------------------------------------------------

export class LoginPortalError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'LoginPortalError';
  }
}

/**
 * Campos ocultos del formulario de verificación. Es TODO el estado del login a
 * medias: el Portal no da cookie en el primer paso, lo lleva en el formulario.
 * Ojo, `password` aquí ya viene cifrado por el Portal, no es la contraseña.
 */
export type PendienteCodigo = { accion: string; campos: Record<string, string> };

function absoluta(accion: string): string {
  if (accion.startsWith('http')) return accion;
  return `${BASE}${accion.startsWith('/') ? '' : '/id/'}${accion}`;
}

/** Cookies `nombre=valor`, sin atributos (Path, HttpOnly…). */
function montarCookie(cookies: string[]): string | null {
  const pares = cookies
    .map((c) => c.split(';')[0]?.trim())
    .filter((c): c is string => c !== undefined && c.includes('='));
  return pares.length > 0 ? pares.join('; ') : null;
}

function textoDeError($: cheerio.CheerioAPI): string {
  $('script, style').remove();
  const texto = $('#contenido').text().replace(/\s+/g, ' ').trim();
  return texto.slice(0, 300) || '(sin texto)';
}

/**
 * Paso 1: usuario y contraseña de la cuenta indicada. **Dispara el envío del
 * código** por correo y SMS, e invalida cualquier código anterior. No lo llames
 * en bucle.
 *
 * Guarda el estado a medias en la cuenta, así que el paso 2 puede completarse
 * desde otro proceso.
 */
export async function pedirCodigo(cuentaId: number): Promise<PendienteCodigo> {
  adoptarHerencia();

  const cred = credencialesDe(cuentaId);
  if (!cred) throw new LoginPortalError('Esa cuenta ya no existe.');

  const r = await fetchConCookies(URL_LOGIN, {
    method: 'POST',
    body: new URLSearchParams({
      usuario: cred.usuario,
      password: cred.clave,
      conectar: 'Conectar',
    }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const $ = cheerio.load(r.texto);
  const form = $('form')
    .toArray()
    .map((f) => $(f))
    .find(($f) => $f.find('input[name="codVerif"]').length > 0);

  if (!form) {
    /* Sin formulario de código: o las credenciales no valen, o el Portal ha
       cambiado el flujo. Se distingue por el texto de la propia página.

       ⚠️ No basta con buscar `name="password"` para dar las credenciales por
       malas: la página del código TAMBIÉN lo lleva, como campo oculto. Eso dio
       un "credenciales rechazadas" con la contraseña correcta. */
    const mensaje = `El Portal no pidió código de verificación (HTTP ${r.estado}). Respondió:\n  ${textoDeError($)}`;
    registrarErrorCuenta(cuentaId, mensaje);
    throw new LoginPortalError(mensaje);
  }

  const campos: Record<string, string> = {};
  form.find('input').each((_, e) => {
    const name = $(e).attr('name');
    if (name && name !== 'codVerif') campos[name] = $(e).attr('value') ?? '';
  });

  const pendiente: PendienteCodigo = {
    accion: absoluta(form.attr('action') ?? '/id/login.php'),
    campos,
  };
  guardarPendiente(cuentaId, pendiente);
  return pendiente;
}

/**
 * Paso 2: el código recibido. Si va bien, guarda la sesión en la cuenta.
 *
 * Toma el estado del paso 1 de la BD, así que no hace falta que sea el mismo
 * proceso el que lo pidió.
 */
export async function enviarCodigo(cuentaId: number, codigo: string): Promise<void> {
  const pendiente = leerPendiente<PendienteCodigo>(cuentaId);
  if (!pendiente) {
    throw new LoginPortalError(
      'No hay ningún login a medias para esa cuenta. Pide primero el código.',
    );
  }

  const r = await fetchConCookies(pendiente.accion, {
    method: 'POST',
    body: new URLSearchParams({ ...pendiente.campos, codVerif: codigo.trim() }).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const cookie = montarCookie(r.cookies);
  if (cookie === null) {
    const mensaje = `El código no fue aceptado (HTTP ${r.estado}). El Portal respondió:\n  ${textoDeError(
      cheerio.load(r.texto),
    )}`;
    registrarErrorCuenta(cuentaId, mensaje);
    throw new LoginPortalError(mensaje);
  }

  guardarSesionCuenta(cuentaId, cookie);
  olvidarPendiente(cuentaId);
}
