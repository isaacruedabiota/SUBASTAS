-- Alertas guardadas e índices para el filtrado avanzado.

-- ---------------------------------------------------------------------------
-- Alertas: criterios guardados que se evalúan contra el catálogo.
-- Los importes van en céntimos y las superficies en m², como en el resto.
-- Un criterio NULL significa "no filtrar por esto".
-- ---------------------------------------------------------------------------
CREATE TABLE alertas (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre               TEXT NOT NULL,
  activa               INTEGER NOT NULL DEFAULT 1,

  provincia            TEXT,
  texto                TEXT,              -- se busca en FTS
  tipo                 TEXT,              -- JUDICIAL, AGENCIA TRIBUTARIA...
  precio_min           INTEGER,
  precio_max           INTEGER,
  superficie_min       REAL,
  superficie_max       REAL,
  anio_min             INTEGER,
  descuento_min        REAL,              -- % mínimo bajo tasación
  /* Solo las que el Portal informa como libres de cargas. Ojo: "no consta"
     NO es "libre", así que este filtro es deliberadamente restrictivo. */
  sin_cargas           INTEGER NOT NULL DEFAULT 0,
  solo_activas         INTEGER NOT NULL DEFAULT 1,

  creada_en            TEXT NOT NULL,
  ultima_revision_en   TEXT
);

-- ---------------------------------------------------------------------------
-- Avisos generados: una fila por (alerta, subasta) para no repetir el aviso,
-- y para poder marcarlos como vistos.
-- ---------------------------------------------------------------------------
CREATE TABLE avisos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  alerta_id     INTEGER NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
  subasta_id    TEXT NOT NULL,
  motivo        TEXT NOT NULL,            -- NUEVA | PUJA | CAMBIO_ESTADO
  detalle       TEXT,
  generado_en   TEXT NOT NULL,
  visto         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (alerta_id, subasta_id, motivo)
);

CREATE INDEX idx_avisos_pendientes ON avisos(visto, generado_en DESC);

-- ---------------------------------------------------------------------------
-- Cola de precarga: qué fichas quedan por leer del Portal y cómo fue el intento.
-- Permite parar y reanudar el worker sin repetir trabajo.
-- ---------------------------------------------------------------------------
CREATE TABLE cola_portal (
  subasta_id     TEXT PRIMARY KEY,
  intentos       INTEGER NOT NULL DEFAULT 0,
  ultimo_error   TEXT,
  ultimo_intento TEXT
);

-- ---------------------------------------------------------------------------
-- Índices para los filtros por rango del buscador.
-- ---------------------------------------------------------------------------
CREATE INDEX idx_subastas_valor     ON subastas(valor_subasta);
CREATE INDEX idx_catastro_sup       ON catastro(superficie_construida);
CREATE INDEX idx_catastro_anio      ON catastro(anio_construccion);
CREATE INDEX idx_inmuebles_cargas   ON inmuebles(cargas_importe);
