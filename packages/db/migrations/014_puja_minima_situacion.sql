-- Qué dice el Portal sobre la puja mínima.
--
-- `puja_minima` en NULL confundía dos cosas opuestas, y es el dato que decide
-- cuánto hay que pujar:
--
--   IMPORTE    hay una cifra: por debajo de ella no se admite la puja
--   SIN_MINIMA el Portal dice literalmente «Sin puja mínima»: NO hay suelo
--   POR_LOTE   «Ver puja mínima de cada lote»: va en cada lote, no aquí
--   NULL       no se ha leído esa pestaña
--
-- Medido sobre las 1.630 fichas leídas: 983 dicen «Sin puja mínima», 482 traen
-- cifra y 165 remiten a los lotes. O sea que la ficha mostraba «No consta» en
-- 983 subastas donde el Portal afirma justo lo contrario — que no hay mínimo.

ALTER TABLE subastas ADD COLUMN puja_minima_situacion TEXT;
ALTER TABLE lotes    ADD COLUMN puja_minima_situacion TEXT;

-- Lo ya leído con cifra es IMPORTE sin lugar a dudas; el resto se rellena
-- releyendo la caché con `npm run reminimas`, sin red.
UPDATE subastas SET puja_minima_situacion = 'IMPORTE' WHERE puja_minima IS NOT NULL;
UPDATE lotes    SET puja_minima_situacion = 'IMPORTE' WHERE puja_minima IS NOT NULL;
