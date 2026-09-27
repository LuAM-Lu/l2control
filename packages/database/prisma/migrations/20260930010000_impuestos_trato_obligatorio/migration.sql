-- Corrige tax_rate_code (B2-2): con code nulo, «code IN (...)» es desconocido y un CHECK
-- desconocido pasa. Un IVA sin trato se colaba. Ahora el IVA exige trato de forma explícita.
ALTER TABLE tax_rate DROP CONSTRAINT tax_rate_code;
ALTER TABLE tax_rate ADD CONSTRAINT tax_rate_code CHECK (
  (tax = 'IVA' AND code IS NOT NULL AND code IN ('GENERAL', 'REDUCIDA')) OR (tax = 'IGTF' AND code IS NULL));
