#!/usr/bin/env bash
#
# Los respaldos del servidor (B7-4, M-26, PLAN §10.4). Corren en el VPS, junto a compose.yml:
#
#   ./respaldar.sh              un respaldo ahora (lo que hace el cron cada noche)
#   ./respaldar.sh --instalar   lo deja en el cron del usuario, cada noche a las 3:15 (hora del servidor)
#   ./respaldar.sh --quitar     lo quita del cron
#
# Un respaldo es el volcado de la base y su «huella» (huella.sql: las filas de cada tabla y lo que suma el
# libro de pagos), tomados en la misma instantánea, con la versión en marcha, en un .tar cifrado para la clave
# pública del local (respaldo-destinatario.pem, junto a .env; se crea con ./restaurar.sh --clave-nueva en otra
# máquina). La privada no está aquí: sin ella el archivo no se abre. Queda en respaldos/diarios/ (los últimos
# 7) y la web se lo sirve a la PC del local preparada en Ajustes → Respaldos, que lo baja y lo confirma.
# Cómo terminó va a la base (backup_copy) con su asiento: el panel lo enseña, también si falló.
#
# Sin la clave pública no se respalda (fail-closed): un volcado sin cifrar no sale del servidor.

set -euo pipefail
cd "$(dirname "$0")"
GUION=$(pwd)/$(basename "$0")

ETIQUETA_ENV=etiqueta.env
DESTINATARIO=respaldo-destinatario.pem
DIARIOS=respaldos/diarios
QUE_SE_GUARDAN=${L2_RESPALDOS_QUE_SE_GUARDAN:-7}

dc() { docker compose --env-file .env --env-file "$ETIQUETA_ENV" "$@"; }
decir() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
del_env() { sed -n "s/^$1=//p" .env | tail -n 1; }
en_marcha() { sed -n 's/^L2_ETIQUETA=//p' "$ETIQUETA_ENV" 2>/dev/null || true; }

# La base como superusuario desde su contenedor; los valores, como variables de psql (`:'nombre'`).
sql() {
  dc exec -T postgres psql -U postgres -d l2control -X -q -A -t -v ON_ERROR_STOP=1 -v t="$TENANT" -v b="$SUCURSAL" "$@"
}

# Un intento que falló, con su motivo, en la base y en la auditoría: el panel y Inicio lo dicen.
fallido() { # motivo
  decir "FALLÓ: $1"
  sql -v d="$1" -v v="$VERSION" <<'SQL' || decir "Ni siquiera se pudo anotar en la base."
WITH c AS (
  INSERT INTO backup_copy (id, tenant_id, state, version, detail)
  VALUES (gen_random_uuid(), :'t', 'FALLIDO', NULLIF(:'v', ''), :'d')
  RETURNING id)
INSERT INTO audit_log (id, tenant_id, branch_id, action, outcome, entity_type, entity_id, after)
SELECT gen_random_uuid(), :'t', :'b', 'respaldo.hacer', 'HECHO', 'backup_copy', c.id::text, jsonb_build_object('estado', 'FALLIDO', 'detalle', :'d')
FROM c;
SQL
  exit 1
}

# El volcado y su huella en la MISMA instantánea: una transacción de solo lectura exporta su foto, pg_dump vuelca
# esa foto y la huella se calcula dentro de la misma transacción. Así lo que cambie mientras tanto (la tasa del
# BCV cada 15 minutos) no hace que la huella y el volcado digan cosas distintas.
volcar() { # carpeta
  local tmp=$1 foto huella
  coproc PG { dc exec -T postgres psql -U postgres -d l2control -X -q -A -t -v ON_ERROR_STOP=1 2>&1; }
  printf '%s\n' "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" "SELECT pg_export_snapshot();" >&"${PG[1]}"
  if ! IFS= read -r -t 60 foto <&"${PG[0]}" || [[ ! $foto =~ ^[0-9A-F]+-[0-9A-F]+-[0-9]+$ ]]; then
    kill "$PG_PID" 2>/dev/null || true
    echo "no se pudo abrir la instantánea: ${foto:-sin respuesta}"
    return 1
  fi
  if ! dc exec -T postgres pg_dump -U postgres -d l2control -Fc --snapshot="$foto" >"$tmp/l2control.dump"; then
    kill "$PG_PID" 2>/dev/null || true
    echo "pg_dump no pudo volcar la base"
    return 1
  fi
  # A una tubería no le llega el descriptor del coproceso (corre en otro proceso): la consulta, antes, a una variable.
  local linea
  linea=$(grep -v '^--' huella.sql | tr '\n' ' ')
  printf '%s\n' "$linea" >&"${PG[1]}"
  if ! IFS= read -r -t 300 huella <&"${PG[0]}" || [[ $huella != '{"tablas"'* ]]; then
    kill "$PG_PID" 2>/dev/null || true
    echo "no se pudo calcular la huella: ${huella:-sin respuesta}"
    return 1
  fi
  printf '%s\n' "$huella" >"$tmp/huella.json"
  printf '%s\n' "COMMIT;" '\q' >&"${PG[1]}"
  wait "$PG_PID" 2>/dev/null || true
}

respaldar() {
  [ -f .env ] || { decir "Falta .env junto a compose.yml."; exit 2; }
  TENANT=$(del_env L2_TENANT_ID)
  SUCURSAL=$(del_env L2_BRANCH_ID)
  VERSION=$(en_marcha)
  [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || VERSION=""
  [ -n "$(en_marcha)" ] || { decir "No hay ninguna versión desplegada: no hay nada que respaldar."; exit 0; }
  # Sin base no se puede ni anotar: el panel lo verá como «atrasado» cuando pase el día.
  [ "$(sql <<<"SELECT 1;" 2>/dev/null)" = "1" ] || { decir "La base no contesta: sin respaldo esta vez."; exit 1; }

  [ -s "$DESTINATARIO" ] || fallido "Falta la clave pública del local ($DESTINATARIO): sin ella no se cifra, y sin cifrar no sale del servidor."
  openssl x509 -in "$DESTINATARIO" -noout 2>/dev/null || fallido "$DESTINATARIO no es una clave pública válida."

  mkdir -p "$DIARIOS"
  local nombre motivo bytes sha
  nombre="l2control-$(date -u +%Y%m%dT%H%M%SZ).l2r"
  # Global: la trampa de salida la borra aunque se salga desde `fallido`.
  tmp=$(mktemp -d "respaldos/.en-curso-XXXXXX")
  # El volcado sin cifrar vive solo mientras dura esto.
  trap 'rm -rf "${tmp:-}"' EXIT
  decir "Respaldando en $nombre…"
  if ! motivo=$(volcar "$tmp"); then fallido "$motivo"; fi
  printf '%s\n' "${VERSION:-desconocida}" >"$tmp/version.txt"
  if ! tar -C "$tmp" -cf - l2control.dump huella.json version.txt |
    openssl cms -encrypt -binary -aes-256-gcm -stream -outform DER -out "$tmp/$nombre" "$DESTINATARIO" 2>"$tmp/openssl.err"; then
    fallido "No se pudo cifrar: $(head -c 300 "$tmp/openssl.err")"
  fi
  bytes=$(stat -c%s "$tmp/$nombre")
  [ "$bytes" -gt 0 ] || fallido "El respaldo cifrado salió vacío."
  sha=$(sha256sum "$tmp/$nombre" | cut -d' ' -f1)
  chmod 644 "$tmp/$nombre"
  mv "$tmp/$nombre" "$DIARIOS/$nombre"

  sql -v f="$nombre" -v n="$bytes" -v h="$sha" -v v="$VERSION" <<'SQL'
WITH c AS (
  INSERT INTO backup_copy (id, tenant_id, state, file, bytes, sha256, version)
  VALUES (gen_random_uuid(), :'t', 'HECHO', :'f', :'n'::bigint, :'h', NULLIF(:'v', ''))
  RETURNING id)
INSERT INTO audit_log (id, tenant_id, branch_id, action, outcome, entity_type, entity_id, after)
SELECT gen_random_uuid(), :'t', :'b', 'respaldo.hacer', 'HECHO', 'backup_copy', c.id::text, jsonb_build_object('archivo', :'f', 'bytes', :'n'::bigint)
FROM c;
SQL
  decir "Hecho: $nombre ($(du -h "$DIARIOS/$nombre" | cut -f1), sha256 $sha)."

  # Aquí se guardan las últimas noches; la PC del local guarda la escalera larga.
  local viejo
  for viejo in $(ls -1 "$DIARIOS"/l2control-*.l2r 2>/dev/null | sort -r | tail -n +$((QUE_SE_GUARDAN + 1))); do
    rm -f "$viejo"
    sql -v f="$(basename "$viejo")" <<<"UPDATE backup_copy SET removed_at = now() WHERE tenant_id = :'t' AND file = :'f' AND removed_at IS NULL;"
    decir "Retirado del servidor: $(basename "$viejo")."
  done
  # Restos de un intento que se cortó a mitad.
  find respaldos -maxdepth 1 -name '.en-curso-*' -mmin +60 -exec rm -rf {} + 2>/dev/null || true
}

LINEA_CRON="15 3 * * * $GUION >> $(pwd)/respaldos.log 2>&1"

# Todo en funciones y la llamada con su `exit` en una línea (como actualizador.sh).
main() {
  case "${1:-}" in
    --instalar)
      { crontab -l 2>/dev/null | grep -vF "$GUION" || true; echo "$LINEA_CRON"; } | crontab -
      echo "En el cron, cada noche: $LINEA_CRON"
      ;;
    --quitar)
      { crontab -l 2>/dev/null | grep -vF "$GUION" || true; } | crontab -
      echo "Quitado del cron."
      ;;
    -h | --help) sed -n '3,17p' "$GUION" | sed 's/^# \{0,1\}//' ;;
    "") respaldar ;;
    *) echo "No conozco «$1». Mira ./respaldar.sh --help" >&2; exit 2 ;;
  esac
}
main "$@"; exit $?
