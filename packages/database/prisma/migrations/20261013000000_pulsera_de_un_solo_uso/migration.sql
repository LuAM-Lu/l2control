-- ═══════════════════════════════════════════════════════════════════════════
-- Pulseras de un solo uso (B4-5, V-1): las pulseras son preimpresas por lote y desechables, así
-- que un código vale para una sola visita. Antes el código solo era único entre estancias ACTIVAS
-- (I-04) y se liberaba al salir; ahora lo es entre todas las de la sucursal, también las cerradas.
-- La base local no tenía códigos repetidos al escribir esto (17 estancias, 17 códigos).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX park_session_pulsera_de_un_solo_uso ON park_session (tenant_id, branch_id, wristband_code);

-- El índice parcial de las activas queda cubierto por este.
DROP INDEX park_session_una_activa_por_pulsera;
