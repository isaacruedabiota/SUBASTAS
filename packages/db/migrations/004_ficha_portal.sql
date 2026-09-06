-- Campos que aporta la ficha del Portal y que el esquema inicial no preveía.
-- El esquema de 001 se diseñó antes de ver una ficha real.

-- Estado literal y datos de contacto de la autoridad gestora.
ALTER TABLE subastas ADD COLUMN estado_texto        TEXT;
ALTER TABLE subastas ADD COLUMN autoridad_codigo    TEXT;
ALTER TABLE subastas ADD COLUMN autoridad_direccion TEXT;
ALTER TABLE subastas ADD COLUMN autoridad_telefono  TEXT;
ALTER TABLE subastas ADD COLUMN autoridad_correo    TEXT;
-- Momento de la última lectura del Portal para esta subasta.
ALTER TABLE subastas ADD COLUMN portal_leido_en     TEXT;

-- Datos registrales y de riesgo del bien.
ALTER TABLE inmuebles ADD COLUMN localidad             TEXT;
ALTER TABLE inmuebles ADD COLUMN cargas_importe        INTEGER;  -- céntimos
ALTER TABLE inmuebles ADD COLUMN vivienda_habitual     INTEGER;  -- 0/1/NULL
ALTER TABLE inmuebles ADD COLUMN inscripcion_registral TEXT;
ALTER TABLE inmuebles ADD COLUMN titulo_juridico       TEXT;
-- Aquí es donde el Portal detalla hipotecas y embargos pendientes.
ALTER TABLE inmuebles ADD COLUMN informacion_adicional TEXT;

CREATE INDEX idx_inmuebles_localidad ON inmuebles(localidad);
