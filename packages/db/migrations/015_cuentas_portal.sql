-- Cuentas del Portal de Subastas y su sesión.
--
-- Antes había UNA cuenta, en `.env` (PORTAL_USUARIO / PORTAL_CLAVE), y UNA
-- sesión, en `data/sesion-portal.json`. Dos problemas:
--
--  1. Para cambiar de cuenta había que editar un fichero y reiniciar.
--  2. El login es de doble factor, así que solo se podía completar desde una
--     consola. Con el estado en la BD, el paso 1 y el paso 2 pueden ocurrir en
--     procesos distintos —por ejemplo, los dos desde el navegador.
--
-- La cookie vive aquí y no en un fichero para que web y CLI vean SIEMPRE la
-- misma sesión: SQLite en WAL sincroniza los dos procesos sin esfuerzo, cosa
-- que un JSON leído en memoria al arrancar no hacía.
--
-- ⚠️ `clave` es la contraseña real, en claro. Es el mismo riesgo que tenía
-- `.env` —fichero local, `data/` fuera de git— pero ahora es alcanzable desde
-- la web, así que la interfaz NUNCA la devuelve al navegador: el formulario de
-- edición trae el campo vacío y solo la escribe si se teclea una nueva.

CREATE TABLE cuentas_portal (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  etiqueta           TEXT NOT NULL,              -- nombre para reconocerla
  usuario            TEXT NOT NULL UNIQUE,
  clave              TEXT NOT NULL,
  /* Desactivada = se conserva pero no se usa para pedir al Portal. */
  activa             INTEGER NOT NULL DEFAULT 1,

  /* Sesión abierta. NULL = anónimo, que es el modo por defecto del proyecto. */
  cookie             TEXT,
  sesion_abierta_en  TEXT,

  /* Login a medias: campos ocultos del formulario de verificación, en JSON.
     El Portal NO da cookie en el paso 1 —todo el estado va en el formulario—,
     así que guardarlo aquí es lo que permite teclear el código más tarde, o
     desde otro sitio. */
  pendiente          TEXT,
  pendiente_en       TEXT,

  ultimo_error       TEXT,
  creada_en          TEXT NOT NULL
);

CREATE INDEX idx_cuentas_activa ON cuentas_portal(activa, sesion_abierta_en DESC);
