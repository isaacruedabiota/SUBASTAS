-- Fotos y documentos que el Portal publica en la pestaña de bienes.
--
-- Descubierto tarde y por casualidad: la ficha del Portal, además de las
-- tablas de datos, puede traer una sección "Imágenes y fotografías" con FOTOS
-- REALES del inmueble, y una lista de PDF con la certificación de cargas, la
-- nota simple o el edicto.
--
-- Son pocas (5% de las subastas traen fotos) pero es la única fotografía del
-- bien que existe en una fuente oficial. Los documentos son mucho más
-- frecuentes (84%) y entre ellos está la certificación de cargas, que es
-- justamente el dato que la ficha suele dejar en "no consta".
--
-- Los metadatos salen gratis: están en un HTML que ya se descargaba. Bajar el
-- fichero es otro paso aparte (npm run fotos), y solo para las imágenes.

CREATE TABLE adjunto_subasta (
  subasta_id    TEXT NOT NULL,
  doc_id        TEXT NOT NULL,          -- identificador opaco del Portal
  tipo          TEXT NOT NULL,          -- FOTO | DOCUMENTO
  titulo        TEXT NOT NULL,          -- "Vista fachada", "CERTIFICACION DE CARGAS"
  orden         INTEGER NOT NULL DEFAULT 0,

  /* Solo para las FOTO que se hayan descargado. NULL = aún no descargada. */
  ruta          TEXT,                   -- relativa a data/fotos/
  descargada_en TEXT,
  intentos      INTEGER NOT NULL DEFAULT 0,
  ultimo_error  TEXT,

  visto_en      TEXT NOT NULL,
  PRIMARY KEY (subasta_id, doc_id)
);

CREATE INDEX idx_adjunto_tipo ON adjunto_subasta(tipo, ruta);
