'use server';

import { revalidatePath } from 'next/cache';
import {
  actualizarCuenta,
  alternarCuenta,
  borrarCuenta,
  cerrarSesionCuenta,
  crearCuenta,
  olvidarPendiente,
  registrarErrorCuenta,
} from '@subastas/db/cuentas';
import { enviarCodigo, pedirCodigo } from '@subastas/ingest/sesion';

/**
 * Cuentas del Portal desde el navegador.
 *
 * **Los errores no se lanzan, se guardan.** Cada acción es un `<form action=…>`
 * normal —funciona sin JavaScript— y desde ahí no hay forma de devolver un
 * mensaje. En vez de reventar con la pantalla de error de Next, el fallo se
 * escribe en `cuentas_portal.ultimo_error` y la página lo pinta junto a la
 * cuenta. Como efecto lateral útil, el último fallo sigue ahí al recargar.
 */

const id = (f: FormData): number | null => {
  const n = Number(f.get('id'));
  return Number.isInteger(n) && n > 0 ? n : null;
};

const refrescar = (): void => {
  revalidatePath('/cuenta');
};

export async function anadirCuenta(formData: FormData): Promise<void> {
  const usuario = String(formData.get('usuario') ?? '').trim();
  const clave = String(formData.get('clave') ?? '');
  if (usuario === '' || clave === '') return;

  crearCuenta({
    etiqueta: String(formData.get('etiqueta') ?? '').trim() || usuario,
    usuario,
    clave,
  });
  refrescar();
}

/**
 * ⚠️ La contraseña nunca vuelve al navegador, así que el formulario de edición
 * llega vacío. Una clave vacía significa «no la cambies», no «bórrala».
 */
export async function editarCuenta(formData: FormData): Promise<void> {
  const n = id(formData);
  if (n === null) return;

  actualizarCuenta(n, {
    etiqueta: String(formData.get('etiqueta') ?? ''),
    usuario: String(formData.get('usuario') ?? ''),
    clave: String(formData.get('clave') ?? ''),
  });
  refrescar();
}

export async function quitarCuenta(formData: FormData): Promise<void> {
  const n = id(formData);
  if (n !== null) borrarCuenta(n);
  refrescar();
}

export async function conmutarCuenta(formData: FormData): Promise<void> {
  const n = id(formData);
  if (n !== null) alternarCuenta(n);
  refrescar();
}

export async function cerrarSesionDe(formData: FormData): Promise<void> {
  const n = id(formData);
  if (n !== null) {
    cerrarSesionCuenta(n);
    registrarErrorCuenta(n, null);
  }
  refrescar();
}

/**
 * Paso 1 del doble factor: manda usuario y contraseña, con lo que el Portal
 * envía un código al correo y al móvil.
 *
 * ⚠️ Cada llamada **invalida el código anterior**. Si el usuario pulsa dos
 * veces, el primero deja de valer — por eso la página lo dice y ofrece cancelar
 * en vez de repetir.
 */
export async function pedirCodigoDe(formData: FormData): Promise<void> {
  const n = id(formData);
  if (n === null) return;

  try {
    await pedirCodigo(n);
  } catch (e) {
    registrarErrorCuenta(n, e instanceof Error ? e.message : String(e));
  }
  refrescar();
}

/** Paso 2: canjea el código por la sesión. */
export async function enviarCodigoDe(formData: FormData): Promise<void> {
  const n = id(formData);
  const codigo = String(formData.get('codigo') ?? '').trim();
  if (n === null || codigo === '') return;

  try {
    await enviarCodigo(n, codigo);
  } catch (e) {
    registrarErrorCuenta(n, e instanceof Error ? e.message : String(e));
  }
  refrescar();
}

export async function cancelarCodigoDe(formData: FormData): Promise<void> {
  const n = id(formData);
  if (n !== null) {
    olvidarPendiente(n);
    registrarErrorCuenta(n, null);
  }
  refrescar();
}
