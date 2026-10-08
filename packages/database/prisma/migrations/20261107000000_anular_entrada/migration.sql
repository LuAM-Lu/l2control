-- B4-10 · Anular una entrada registrada por error (M-27, P-7).
-- Solo EXPANDE (ADR-028): tres comprobaciones que admiten un valor más y un índice único menos estricto. La versión
-- anterior sigue escribiendo lo que escribía.
--   · park_session.closure_kind admite ANULADA: la estancia de una entrada por error se cierra con su motivo, sin
--     tiempo de más ni quién lo recogió (nadie lo recogió: no debió entrar).
--   · account_version.cause admite ANULAR_ENTRADA.
--   · Una pulsera es de una visita (V-1), pero la de una entrada anulada vuelve a servir: el índice de un solo uso no
--     cuenta las estancias anuladas.
BEGIN;

ALTER TABLE park_session DROP CONSTRAINT park_session_tipo_de_cierre;
ALTER TABLE park_session ADD CONSTRAINT park_session_tipo_de_cierre CHECK (
  (status = 'CERRADA') = (closure_kind IS NOT NULL)
  AND (closure_kind IS NULL OR closure_kind IN ('SALIDA', 'ADMINISTRATIVA', 'ANULADA')));

-- Un cierre administrativo o una anulación dicen por qué, y no dicen quién recogió al niño.
ALTER TABLE park_session DROP CONSTRAINT park_session_cierre_administrativo;
ALTER TABLE park_session ADD CONSTRAINT park_session_cierre_administrativo CHECK (
  (closure_kind IN ('ADMINISTRATIVA', 'ANULADA')) = (closure_reason IS NOT NULL)
  AND (closure_reason IS NULL OR length(btrim(closure_reason)) BETWEEN 5 AND 200)
  AND (closure_kind NOT IN ('ADMINISTRATIVA', 'ANULADA') OR closure_kind IS NULL OR picked_up_by_guardian IS NULL));

ALTER TABLE account_version DROP CONSTRAINT account_version_cause;
ALTER TABLE account_version ADD CONSTRAINT account_version_cause CHECK (
  cause IN ('GUARDAR', 'COBRO', 'ANULACION', 'CORTESIA', 'INCOBRABLE', 'ENTRADA', 'SALIDA', 'RECARGA', 'CIERRE_ADMINISTRATIVO', 'DESCUENTO', 'PEDIDO', 'VINCULAR', 'ANULACION_PEDIDO', 'LIBERAR', 'RESERVA', 'CANCELAR_RESERVA', 'EMPEZAR_EVENTO', 'ANULAR_ENTRADA'));

DROP INDEX park_session_pulsera_de_un_solo_uso;
CREATE UNIQUE INDEX park_session_pulsera_de_un_solo_uso ON park_session (tenant_id, branch_id, wristband_code)
  WHERE closure_kind IS DISTINCT FROM 'ANULADA';

COMMIT;
