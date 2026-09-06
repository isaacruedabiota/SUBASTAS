-- Dos arreglos de datos que deja el paso a `situacion` y `lote`.

-- 1. Filas antiguas con importe pero sin situación. Si el Portal publicó la
--    cifra, la situación es CONOCIDA por definición: son las que `repujas` no
--    pudo tocar porque su página ya no estaba en la caché.
UPDATE estado_puja
   SET situacion = 'CONOCIDA'
 WHERE situacion IS NULL AND puja_maxima IS NOT NULL;

-- 2. En las subastas de varios lotes, las lecturas anteriores a la columna
--    `lote` quedaron con lote NULL: son una cifra "de la subasta" que el Portal
--    nunca da cuando hay lotes (da una por lote). Mezclarlas con las lecturas
--    por lote duplicaría importes y contaría un lote de más.
--
--    No se borran las de subastas de lote único: ahí NULL es lo correcto.
DELETE FROM estado_puja
 WHERE lote IS NULL
   AND subasta_id IN (SELECT subasta_id FROM estado_puja WHERE lote IS NOT NULL);
