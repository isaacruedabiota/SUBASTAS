import { abrirBd } from './index';

/**
 * Cuentas del Portal de Subastas.
 *
 * **Para qué.** Solo con sesión publica el Portal el importe de la puja de una
 * subasta en curso; a un anónimo le dice «para ver su importe debe acceder como
 * usuario registrado». Ver `sources/portal-subastas/sesion.ts` en la ingesta.
 *
 * **Por qué en la BD y no en `.env`.** El login es de doble factor: el paso 1
 * manda un código y el paso 2 lo canjea. El Portal no da cookie entre medias —
 * todo el estado va en campos ocultos del formulario—, así que guardarlo aquí es
 * lo que permite que los dos pasos ocurran en procesos distintos: pedir el
 * código desde el navegador y teclearlo un minuto después, o desde la consola.
 * De paso, web y CLI ven la misma sesión sin ponerse de acuerdo.
 *
 * **⚠️ La contraseña se guarda en claro** y este módulo la devuelve solo por
 * `credencialesDe()`, que existe para hacer login y para nada más. `CuentaPortal`
 * —lo que ve la interfaz— no la lleva, y tampoco la cookie: lo que no cruza
 * hacia el navegador no se puede filtrar por descuido.
 */

/** Lo que la interfaz puede ver. Sin contraseña y sin cookie, a propósito. */
export interface CuentaPortal {
  id: number;
  etiqueta: string;
  usuario: string;
  activa: boolean;
  /** Cuándo se abrió la sesión. null = no hay sesión; se navegará anónimo. */
  sesionAbiertaEn: string | null;
  /** Hay un login a medias: se pidió el código y falta canjearlo. */
  esperandoCodigo: boolean;
  pendienteEn: string | null;
  ultimoError: string | null;
  creadaEn: string;
}

const aCuenta = (f: Record<string, unknown>): CuentaPortal => ({
  id: f.id as number,
  etiqueta: f.etiqueta as string,
  usuario: f.usuario as string,
  activa: Boolean(f.activa),
  sesionAbiertaEn: (f.sesion_abierta_en as string) ?? null,
  esperandoCodigo: f.pendiente !== null && f.pendiente !== undefined,
  pendienteEn: (f.pendiente_en as string) ?? null,
  ultimoError: (f.ultimo_error as string) ?? null,
  creadaEn: f.creada_en as string,
});

export function listarCuentas(): CuentaPortal[] {
  return (
    abrirBd()
      .prepare(
        `SELECT id, etiqueta, usuario, activa, sesion_abierta_en, pendiente,
                pendiente_en, ultimo_error, creada_en
           FROM cuentas_portal
          ORDER BY activa DESC, creada_en`,
      )
      .all() as Array<Record<string, unknown>>
  ).map(aCuenta);
}

export function obtenerCuenta(id: number): CuentaPortal | null {
  const f = abrirBd()
    .prepare(
      `SELECT id, etiqueta, usuario, activa, sesion_abierta_en, pendiente,
              pendiente_en, ultimo_error, creada_en
         FROM cuentas_portal WHERE id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return f ? aCuenta(f) : null;
}

export function hayCuentas(): boolean {
  const f = abrirBd().prepare('SELECT COUNT(*) AS n FROM cuentas_portal').get() as {
    n: number;
  };
  return f.n > 0;
}

export function crearCuenta(datos: {
  etiqueta: string;
  usuario: string;
  clave: string;
}): number {
  const res = abrirBd()
    .prepare(
      `INSERT INTO cuentas_portal (etiqueta, usuario, clave, creada_en)
       VALUES (?,?,?,?)`,
    )
    .run(
      datos.etiqueta.trim() || datos.usuario.trim(),
      datos.usuario.trim(),
      datos.clave,
      new Date().toISOString(),
    );
  return Number(res.lastInsertRowid);
}

/**
 * Cambia lo que se haya tecleado. **Una `clave` vacía no borra la guardada**:
 * el formulario de edición viene siempre en blanco (la contraseña no vuelve al
 * navegador), así que enviarlo sin tocar ese campo no debe dejar la cuenta sin
 * contraseña.
 *
 * Cambiar usuario o contraseña invalida la sesión: la que hubiera es de otras
 * credenciales.
 */
export function actualizarCuenta(
  id: number,
  cambios: { etiqueta?: string; usuario?: string; clave?: string },
): void {
  const db = abrirBd();

  if (cambios.etiqueta !== undefined && cambios.etiqueta.trim() !== '') {
    db.prepare('UPDATE cuentas_portal SET etiqueta = ? WHERE id = ?').run(
      cambios.etiqueta.trim(),
      id,
    );
  }

  const nuevoUsuario = cambios.usuario?.trim();
  if (nuevoUsuario) {
    db.prepare('UPDATE cuentas_portal SET usuario = ? WHERE id = ?').run(
      nuevoUsuario,
      id,
    );
  }

  if (cambios.clave !== undefined && cambios.clave !== '') {
    db.prepare('UPDATE cuentas_portal SET clave = ? WHERE id = ?').run(
      cambios.clave,
      id,
    );
  }

  if (nuevoUsuario || (cambios.clave !== undefined && cambios.clave !== '')) {
    cerrarSesionCuenta(id);
  }
}

export function borrarCuenta(id: number): void {
  abrirBd().prepare('DELETE FROM cuentas_portal WHERE id = ?').run(id);
}

export function alternarCuenta(id: number): void {
  abrirBd().prepare('UPDATE cuentas_portal SET activa = NOT activa WHERE id = ?').run(id);
}

/** Solo para iniciar sesión. El único sitio del que sale la contraseña. */
export function credencialesDe(id: number): { usuario: string; clave: string } | null {
  const f = abrirBd()
    .prepare('SELECT usuario, clave FROM cuentas_portal WHERE id = ?')
    .get(id) as { usuario: string; clave: string } | undefined;
  return f ? { usuario: f.usuario, clave: f.clave } : null;
}

// ---------------------------------------------------------------------------
// Login a medias
// ---------------------------------------------------------------------------

export function guardarPendiente(id: number, pendiente: unknown): void {
  abrirBd()
    .prepare(
      `UPDATE cuentas_portal
          SET pendiente = ?, pendiente_en = ?, ultimo_error = NULL
        WHERE id = ?`,
    )
    .run(JSON.stringify(pendiente), new Date().toISOString(), id);
}

export function leerPendiente<T>(id: number): T | null {
  const f = abrirBd()
    .prepare('SELECT pendiente FROM cuentas_portal WHERE id = ?')
    .get(id) as { pendiente: string | null } | undefined;
  if (!f?.pendiente) return null;
  try {
    return JSON.parse(f.pendiente) as T;
  } catch {
    return null;
  }
}

export function olvidarPendiente(id: number): void {
  abrirBd()
    .prepare('UPDATE cuentas_portal SET pendiente = NULL, pendiente_en = NULL WHERE id = ?')
    .run(id);
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

export function guardarSesionCuenta(id: number, cookie: string): void {
  abrirBd()
    .prepare(
      `UPDATE cuentas_portal
          SET cookie = ?, sesion_abierta_en = ?,
              pendiente = NULL, pendiente_en = NULL, ultimo_error = NULL
        WHERE id = ?`,
    )
    .run(cookie, new Date().toISOString(), id);
}

export function cerrarSesionCuenta(id: number): void {
  abrirBd()
    .prepare('UPDATE cuentas_portal SET cookie = NULL, sesion_abierta_en = NULL WHERE id = ?')
    .run(id);
}

export function registrarErrorCuenta(id: number, error: string | null): void {
  abrirBd().prepare('UPDATE cuentas_portal SET ultimo_error = ? WHERE id = ?').run(error, id);
}

/**
 * La sesión que se usará para pedir al Portal: la más reciente entre las cuentas
 * activas. Con varias cuentas abiertas manda la última en entrar, que es la que
 * el usuario acaba de tocar.
 */
export function sesionEnUso(): { id: number; usuario: string; cookie: string } | null {
  const f = abrirBd()
    .prepare(
      `SELECT id, usuario, cookie FROM cuentas_portal
        WHERE activa = 1 AND cookie IS NOT NULL
        ORDER BY sesion_abierta_en DESC LIMIT 1`,
    )
    .get() as { id: number; usuario: string; cookie: string } | undefined;
  return f ?? null;
}

/**
 * Adopta la cuenta que vivía en `.env` y la sesión de
 * `data/sesion-portal.json`. Solo actúa si aún no hay ninguna cuenta: pasado el
 * primer arranque, la BD manda y el `.env` deja de mirarse.
 *
 * Devuelve el id si ha importado algo.
 */
export function adoptarCuentaHeredada(datos: {
  usuario: string;
  clave: string;
  cookie?: string | null;
  abiertaEn?: string | null;
}): number | null {
  if (hayCuentas()) return null;

  const id = crearCuenta({
    etiqueta: datos.usuario,
    usuario: datos.usuario,
    clave: datos.clave,
  });

  if (datos.cookie) {
    abrirBd()
      .prepare('UPDATE cuentas_portal SET cookie = ?, sesion_abierta_en = ? WHERE id = ?')
      .run(datos.cookie, datos.abiertaEn ?? new Date().toISOString(), id);
  }

  return id;
}
