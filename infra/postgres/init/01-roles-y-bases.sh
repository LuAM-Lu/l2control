#!/bin/sh
# Primer arranque del PostgreSQL de desarrollo (B0-1). Solo corre con el volumen vacío.
#
# Tres papeles, separados a propósito (ADR-002):
#   postgres     superusuario. Solo administra. Un superusuario IGNORA la RLS aunque sea
#                FORCE, así que la aplicación nunca se conecta con él.
#   l2_migrator  dueño de las tablas: aplica las migraciones. Con FORCE, la RLS le aplica
#                también a él.
#   l2_app       con el que se conecta la aplicación: solo lee y escribe filas, no crea
#                ni altera tablas, y no puede saltarse la RLS (NOBYPASSRLS).
#
# Dos bases: l2control (desarrollo) y l2control_test (pruebas de integración).
set -eu

: "${L2_MIGRATOR_PASSWORD:?falta L2_MIGRATOR_PASSWORD}"
: "${L2_APP_PASSWORD:?falta L2_APP_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v migrator_pw="$L2_MIGRATOR_PASSWORD" -v app_pw="$L2_APP_PASSWORD" <<'SQL'
-- CREATEDB solo porque `prisma migrate dev` crea y borra una base «sombra» para comparar.
CREATE ROLE l2_migrator LOGIN PASSWORD :'migrator_pw' NOSUPERUSER CREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE l2_app      LOGIN PASSWORD :'app_pw'      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
SQL

for base in l2control l2control_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c "CREATE DATABASE $base OWNER l2_migrator"

  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$base" <<'SQL'
-- Nadie crea objetos en public salvo su dueño; la aplicación solo entra.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO l2_migrator;
GRANT USAGE ON SCHEMA public TO l2_app;

-- Lo que cree el migrador en el futuro, la aplicación lo puede leer y escribir…
ALTER DEFAULT PRIVILEGES FOR ROLE l2_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO l2_app;
ALTER DEFAULT PRIVILEGES FOR ROLE l2_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO l2_app;
-- …pero UPDATE y DELETE sobre las tablas append-only los niegan sus disparadores (regla 5).
SQL
done
