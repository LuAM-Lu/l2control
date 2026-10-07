-- La huella de un respaldo (B7-4, PLAN §10.4): cuántas filas tiene cada tabla y lo que suma el libro de pagos
-- por tipo, medio y moneda. respaldar.sh la calcula en la misma instantánea que el volcado y la guarda dentro
-- del respaldo; restaurar.sh la calcula otra vez sobre la base restaurada. Si no coinciden, el respaldo no
-- está íntegro. Una sola sentencia, sin comentarios dentro: los guiones la mandan en una línea.
SELECT json_build_object(
  'tablas', (
    SELECT json_object_agg(t.table_name, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', t.table_name), false, true, '')))[1]::text::bigint ORDER BY t.table_name)
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'),
  'pagos', (
    SELECT coalesce(json_object_agg(s.clave, s.suma ORDER BY s.clave), '{}'::json)
    FROM (SELECT kind || ' ' || method || ' ' || currency AS clave,
                 json_build_object('monto', sum(amount_minor)::text, 'igtf', sum(igtf_minor)::text) AS suma
          FROM payment GROUP BY kind, method, currency) s)
)::text;
