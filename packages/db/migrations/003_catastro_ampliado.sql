-- La tabla `catastro` de 001 se quedó corta frente a lo que devuelve el OVC.
-- Se amplía con los campos observados en respuestas reales (urbanas y rústicas).

ALTER TABLE catastro ADD COLUMN clase              TEXT;   -- URBANA | RUSTICA
ALTER TABLE catastro ADD COLUMN provincia          TEXT;
ALTER TABLE catastro ADD COLUMN municipio          TEXT;
ALTER TABLE catastro ADD COLUMN direccion_completa TEXT;   -- campo `ldt` del OVC
ALTER TABLE catastro ADD COLUMN tipo_finca         TEXT;   -- p.ej. división horizontal
ALTER TABLE catastro ADD COLUMN url_plano          TEXT;   -- cartografía de la sede
ALTER TABLE catastro ADD COLUMN error              TEXT;   -- si la consulta no dio inmueble

CREATE INDEX idx_catastro_municipio ON catastro(provincia, municipio);
CREATE INDEX idx_catastro_uso       ON catastro(uso_principal);
