-- Vista de calle del inmueble.
--
-- Dos fuentes con condiciones muy distintas, y por eso solo una se guarda:
--
--   * Google Street View  — cobertura casi total en España, pero sus términos
--     NO permiten almacenar ni cachear la imagen. Se pide en vivo a través de
--     /api/streetview cada vez que se abre la ficha y no toca esta tabla.
--   * Mapillary — colaborativa y CC-BY-SA 4.0, así que sí se puede descargar
--     y conservar citando al autor. Es lo que registra esta tabla.
--
-- La clave es la referencia catastral porque es de donde salen las coordenadas
-- (tabla catastro), igual que en el resto del enriquecimiento.

CREATE TABLE imagen_calle (
  referencia_catastral TEXT PRIMARY KEY,

  /* 0 = hay foto; 1 = se buscó y no había ninguna cerca. Se guarda el "no hay"
     para no volver a preguntar por el mismo sitio en cada pasada. */
  sin_cobertura        INTEGER NOT NULL DEFAULT 0,

  imagen_id            TEXT,             -- id en Mapillary
  ruta                 TEXT,             -- relativa a data/calle/
  url_origen           TEXT,
  lat                  REAL,             -- dónde estaba la cámara
  lon                  REAL,
  rumbo                REAL,             -- compass_angle, grados
  distancia_m          REAL,             -- de la parcela a la cámara
  capturada_en         TEXT,             -- fecha de la foto (ISO)
  autor                TEXT,             -- atribución exigida por CC-BY-SA
  licencia             TEXT,

  consultada_en        TEXT NOT NULL,
  intentos             INTEGER NOT NULL DEFAULT 0,
  ultimo_error         TEXT
);

-- Para el worker: qué queda por mirar.
CREATE INDEX idx_imagen_calle_pendientes ON imagen_calle(sin_cobertura, consultada_en);
