-- La puja es POR LOTE cuando la subasta tiene varios.
--
-- Con lotes, la pestaña de pujas no da una cifra de la subasta: da la del lote
-- que estés mirando ("Sin pujas en el lote 1 de esta subasta"). Guardar la del
-- lote 1 como si fuera la de la subasta repetiría el error que este proyecto
-- lleva corrigiendo: atribuir a un todo lo que solo se sabe de una parte.
--
-- NULL = la subasta no tiene lotes separados (lote implícito único), que es el
-- caso de 247 de las 285 subastas en curso.

ALTER TABLE estado_puja ADD COLUMN lote INTEGER;

CREATE INDEX idx_puja_subasta_lote ON estado_puja(subasta_id, lote, capturado_en DESC);
