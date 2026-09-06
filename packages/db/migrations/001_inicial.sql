-- Esquema inicial. Todos los importes son céntimos enteros (ver core/money.ts).
-- Las fechas son texto ISO 8601 con zona Europe/Madrid.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Subastas: una fila por identificador oficial del BOE.
-- ---------------------------------------------------------------------------
CREATE TABLE subastas (
  identificador       TEXT PRIMARY KEY,          -- SUB-JA-2026-123456
  tipo                TEXT NOT NULL,             -- JUDICIAL | NOTARIAL | ...
  estado              TEXT NOT NULL,             -- CELEBRANDOSE | CONCLUIDA | ...

  fecha_inicio        TEXT,
  fecha_conclusion    TEXT,

  autoridad_gestora   TEXT,
  expediente          TEXT,
  nig                 TEXT,

  valor_subasta       INTEGER,
  tasacion            INTEGER,
  puja_minima         INTEGER,
  importe_deposito    INTEGER,
  tramos_entre_pujas  INTEGER,
  cantidad_reclamada  INTEGER,

  url_anuncio_boe     TEXT,
  id_anuncio_boe      TEXT,
  url_portal          TEXT,
  ingerido_en         TEXT NOT NULL,
  actualizado_en      TEXT NOT NULL
);

CREATE INDEX idx_subastas_estado      ON subastas(estado);
CREATE INDEX idx_subastas_tipo        ON subastas(tipo);
CREATE INDEX idx_subastas_conclusion  ON subastas(fecha_conclusion);
CREATE INDEX idx_subastas_tasacion    ON subastas(tasacion);

-- ---------------------------------------------------------------------------
-- Lotes: una subasta puede sacar varios bienes por separado.
-- ---------------------------------------------------------------------------
CREATE TABLE lotes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  subasta_id          TEXT NOT NULL REFERENCES subastas(identificador) ON DELETE CASCADE,
  numero              INTEGER NOT NULL,
  tipo_bien           TEXT NOT NULL,             -- INMUEBLE | VEHICULO | MUEBLE | OTRO
  valor_subasta       INTEGER,
  tasacion            INTEGER,
  puja_minima         INTEGER,
  descripcion         TEXT,
  UNIQUE (subasta_id, numero)
);

CREATE INDEX idx_lotes_subasta ON lotes(subasta_id);

-- ---------------------------------------------------------------------------
-- Inmuebles: lo que trae el anuncio del BOE. Suele ser escueto.
-- ---------------------------------------------------------------------------
CREATE TABLE inmuebles (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id               INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  direccion             TEXT,
  municipio             TEXT,
  provincia             TEXT,
  codigo_postal         TEXT,
  referencia_catastral  TEXT,
  cru                   TEXT,                    -- Código Registral Único
  descripcion           TEXT,
  situacion_posesoria   TEXT,                    -- ocupado/libre: define el riesgo real
  visitable             INTEGER,                 -- 0/1/NULL
  cargas                TEXT                     -- cargas que NO se cancelan. Crítico.
);

CREATE INDEX idx_inmuebles_lote      ON inmuebles(lote_id);
CREATE INDEX idx_inmuebles_provincia ON inmuebles(provincia);
CREATE INDEX idx_inmuebles_refcat    ON inmuebles(referencia_catastral);

-- ---------------------------------------------------------------------------
-- Catastro: el enriquecimiento, cacheado por referencia catastral.
-- Se separa de `inmuebles` porque varias subastas pueden referirse al mismo
-- inmueble a lo largo del tiempo, y la consulta al OVC se reaprovecha.
-- ---------------------------------------------------------------------------
CREATE TABLE catastro (
  referencia_catastral    TEXT PRIMARY KEY,
  superficie_construida   REAL,
  superficie_suelo        REAL,
  anio_construccion       INTEGER,
  uso_principal           TEXT,
  localizacion            TEXT,
  lat                     REAL,
  lon                     REAL,
  consultado_en           TEXT NOT NULL,
  -- Respuesta cruda del OVC, por si hay que reprocesar sin volver a pedirla.
  respuesta_cruda         TEXT
);

CREATE INDEX idx_catastro_coords ON catastro(lat, lon);

-- ---------------------------------------------------------------------------
-- Estado de puja: serie temporal, una fila por captura.
-- No se sobrescribe: así se ve cómo evolucionó la puja durante la subasta.
-- ---------------------------------------------------------------------------
CREATE TABLE estado_puja (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  subasta_id        TEXT NOT NULL REFERENCES subastas(identificador) ON DELETE CASCADE,
  puja_maxima       INTEGER,
  numero_pujas      INTEGER,
  numero_pujantes   INTEGER,
  capturado_en      TEXT NOT NULL
);

CREATE INDEX idx_puja_subasta ON estado_puja(subasta_id, capturado_en DESC);

-- ---------------------------------------------------------------------------
-- Resultado final. Es la base de las vistas de histórico.
-- ---------------------------------------------------------------------------
CREATE TABLE resultados (
  subasta_id            TEXT PRIMARY KEY REFERENCES subastas(identificador) ON DELETE CASCADE,
  adjudicada            INTEGER NOT NULL,        -- 0/1
  desierta              INTEGER NOT NULL,        -- 0/1
  importe_adjudicacion  INTEGER,
  ratio_sobre_tasacion  REAL,                    -- adjudicacion / tasacion
  registrado_en         TEXT NOT NULL
);

CREATE INDEX idx_resultados_ratio ON resultados(ratio_sobre_tasacion);

-- ---------------------------------------------------------------------------
-- Búsqueda de texto completo (sustituye a Typesense).
-- Tabla externa: FTS5 indexa, los datos viven en las tablas de arriba.
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE busqueda USING fts5(
  subasta_id UNINDEXED,
  direccion,
  municipio,
  provincia,
  descripcion,
  tokenize = 'unicode61 remove_diacritics 2'
);
