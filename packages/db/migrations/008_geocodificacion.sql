-- Coordenadas obtenidas de la dirección, cuando Catastro no las da.
--
-- Hasta ahora las coordenadas venían solo de Catastro, que exige referencia
-- catastral. Sin ella no había ni ortofoto, ni punto en el mapa, ni vista de
-- calle precisa — y eso son ~390 subastas que SÍ traen dirección.
--
-- Cartociudad (IGN) resuelve direcciones españolas gratis y sin clave. Sus
-- coordenadas se guardan APARTE de las de Catastro, y no se mezclan, porque
-- no son lo mismo:
--
--   catastro.lat/lon  -> centroide de la parcela, dato oficial del inmueble
--   geocodificacion   -> portal de la calle, deducido de un texto que puede
--                        venir con erratas ("PARRIDA TERATINO")
--
-- La ficha avisa del origen: una coordenada deducida no debe presentarse con
-- la misma confianza que una catastral.

CREATE TABLE geocodificacion (
  inmueble_id   INTEGER PRIMARY KEY REFERENCES inmuebles(id) ON DELETE CASCADE,

  lat           REAL,
  lon           REAL,
  /* portal = número de la calle; callejero = solo la vía. Nada peor se acepta:
     un resultado de tipo "Municipio" devuelve el centro del pueblo. */
  precision     TEXT,

  consulta      TEXT,              -- lo que se le mandó, para depurar
  direccion_normalizada TEXT,      -- lo que el IGN entendió

  consultado_en TEXT NOT NULL,
  intentos      INTEGER NOT NULL DEFAULT 0,
  error         TEXT
);

CREATE INDEX idx_geocodificacion_ok ON geocodificacion(lat, lon);
