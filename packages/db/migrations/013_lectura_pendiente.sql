-- Fichas leídas por la precarga anterior a la columna `lectura`.
--
-- Se leyeron enteras (era el único modo que existía), así que son COMPLETA.
-- Dejarlas en NULL haría que la ficha intentara "completarlas" al abrirlas, y
-- eso serían dos peticiones al Portal por cada una para no aprender nada.

UPDATE subastas
   SET lectura = 'COMPLETA'
 WHERE lectura IS NULL AND portal_leido_en IS NOT NULL;
