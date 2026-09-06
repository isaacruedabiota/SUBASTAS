-- Salida de los avisos: correo y push al móvil.
--
-- Hasta ahora una alerta generaba una fila en `avisos` y ahí se quedaba: había
-- que entrar en la web a mirar. Estas tres piezas la sacan de la web:
--
--   ajustes             → a dónde enviar y por qué vías (editable desde /ajustes)
--   suscripciones_push  → los navegadores que han dado permiso de notificación
--   avisos.notificado_en → qué se ha enviado ya
--
-- `notificado_en` es la clave de que no se repitan: es el mismo criterio que
-- `visto`, pero separado a propósito. Marcar un aviso como visto en la web NO
-- debe impedir que se envíe, ni al revés — son dos hechos distintos.

-- ---------------------------------------------------------------------------
-- Ajustes sueltos, clave/valor. No merecen tabla propia ni fichero: son cuatro
-- líneas que el usuario cambia desde la web y que deben sobrevivir al proceso.
--
-- Aquí viven también las claves VAPID del push. Se generan solas la primera vez
-- (no hay que registrarse en ningún sitio) y NO deben cambiar: cada cambio
-- invalida todas las suscripciones existentes y hay que volver a dar permiso.
-- ---------------------------------------------------------------------------
CREATE TABLE ajustes (
  clave       TEXT PRIMARY KEY,
  valor       TEXT,
  guardado_en TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Suscripciones de Web Push: un navegador que ha aceptado recibir avisos.
--
-- `endpoint` es la URL que da el navegador (FCM en Android, Apple en iOS) y es
-- la identidad de la suscripción, de ahí el UNIQUE. Las dos claves son las que
-- cifran el mensaje: el servidor de push NO puede leer el contenido, solo el
-- navegador que se suscribió.
--
-- ⚠️ Una suscripción caduca sola. Cuando el servidor de push responde 404 o 410
-- la fila se borra: reintentarla es tráfico perdido para siempre.
-- ---------------------------------------------------------------------------
CREATE TABLE suscripciones_push (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint       TEXT NOT NULL UNIQUE,
  p256dh         TEXT NOT NULL,
  auth           TEXT NOT NULL,
  etiqueta       TEXT,                    -- "Móvil", "Portátil"…
  creada_en      TEXT NOT NULL,
  ultimo_uso_en  TEXT,
  ultimo_error   TEXT
);

-- ---------------------------------------------------------------------------
-- Qué avisos se han enviado ya. NULL = pendiente de enviar.
-- ---------------------------------------------------------------------------
ALTER TABLE avisos ADD COLUMN notificado_en TEXT;

CREATE INDEX idx_avisos_sin_notificar ON avisos(notificado_en, generado_en);
