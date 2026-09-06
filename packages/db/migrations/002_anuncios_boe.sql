-- Anuncios del diario BOE (API de datos abiertos).
--
-- Son una fuente DISTINTA de las subastas del Portal: aquí llegan convocatorias
-- de la Delegación de Economía y Hacienda, TGSS, AENA, ADIF y autoridades
-- portuarias, en volumen bajo (~1/día). No traen identificador SUB-*.
-- Por eso viven en su propia tabla y no en `subastas`.

CREATE TABLE anuncios_boe (
  identificador       TEXT PRIMARY KEY,          -- BOE-B-2026-25447
  titulo              TEXT NOT NULL,
  departamento        TEXT,
  departamento_codigo TEXT,
  fecha_publicacion   TEXT,                      -- AAAAMMDD tal como lo da el BOE
  seccion             TEXT,
  subseccion          TEXT,
  url_pdf             TEXT,
  url_html            TEXT,
  url_xml             TEXT,
  texto               TEXT,                      -- cuerpo completo en texto plano
  ingerido_en         TEXT NOT NULL
);

CREATE INDEX idx_anuncios_fecha   ON anuncios_boe(fecha_publicacion);
CREATE INDEX idx_anuncios_seccion ON anuncios_boe(seccion, subseccion);

-- Referencias catastrales extraídas del cuerpo del anuncio.
-- Un anuncio puede sacar varios inmuebles, así que es 1:N.
-- Esta tabla es el puente hacia el enriquecimiento de Catastro.
CREATE TABLE anuncio_referencias (
  anuncio_id            TEXT NOT NULL REFERENCES anuncios_boe(identificador) ON DELETE CASCADE,
  referencia_catastral  TEXT NOT NULL,
  PRIMARY KEY (anuncio_id, referencia_catastral)
);

CREATE INDEX idx_anuncio_ref_refcat ON anuncio_referencias(referencia_catastral);

-- Identificadores SUB-* citados en el cuerpo, cuando el anuncio remite al Portal.
CREATE TABLE anuncio_subastas (
  anuncio_id    TEXT NOT NULL REFERENCES anuncios_boe(identificador) ON DELETE CASCADE,
  subasta_id    TEXT NOT NULL,
  PRIMARY KEY (anuncio_id, subasta_id)
);

-- Búsqueda de texto sobre los anuncios.
CREATE VIRTUAL TABLE busqueda_anuncios USING fts5(
  identificador UNINDEXED,
  titulo,
  texto,
  tokenize = 'unicode61 remove_diacritics 2'
);
