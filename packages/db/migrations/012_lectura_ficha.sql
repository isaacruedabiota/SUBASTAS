-- Dos niveles de lectura de la ficha del Portal.
--
-- El catálogo entero no se lee igual. Lo publicado hasta ayer se precarga
-- completo (`npm run precargar`); lo que va llegando a partir de ahora se lee
-- solo en lo básico —pestaña de datos y pestaña de bienes— y el resto se
-- completa cuando el usuario abre esa ficha. Así lo nuevo aparece en el listado
-- con importes, dirección y mapa sin pedirle al Portal cuatro páginas de cada
-- subasta que quizá nadie mire.
--
--   BASICA   = datos + bienes. Sin autoridad gestora ni pujas.
--   COMPLETA = las cuatro pestañas.
--
-- Lo ya leído hasta hoy se leyó entero.

ALTER TABLE subastas ADD COLUMN lectura TEXT;

-- Nº de lotes que DECLARA la ficha, que no siempre es el de lotes leídos.
ALTER TABLE subastas ADD COLUMN numero_lotes INTEGER;

UPDATE subastas SET lectura = 'COMPLETA' WHERE portal_leido_en IS NOT NULL;

CREATE INDEX idx_subastas_lectura ON subastas(lectura);
