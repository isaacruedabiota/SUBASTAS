-- Qué se sabe de la puja en cada captura.
--
-- Hasta ahora solo se guardaba el importe, y eso confundía dos cosas muy
-- distintas: que el Portal diga "La subasta no ha recibido pujas" y que diga
-- "ha recibido alguna puja, para ver su importe acceda como usuario
-- registrado". Sin importe, ambas quedaban en NULL y la ficha las mostraba
-- igual — como si no hubiera pujas. Es el mismo error que decir "libre de
-- cargas" cuando el dato solo es que no consta.
--
--   CONOCIDA  el Portal publica la cifra (solo al concluir la subasta)
--   SIN_PUJAS consta expresamente que no ha recibido ninguna
--   OCULTA    consta que ha recibido alguna; el importe exige iniciar sesión
--   SECRETA   la puja máxima es secreta por decisión de la subasta
--   NULL      la pestaña no dijo nada reconocible (fichas viejas sin reparsear)

ALTER TABLE estado_puja ADD COLUMN situacion TEXT;

CREATE INDEX idx_puja_situacion ON estado_puja(situacion);
