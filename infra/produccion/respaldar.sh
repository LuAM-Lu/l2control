#!/usr/bin/env bash
#
# Los respaldos del servidor (B7-4, M-26, PLAN §10.4). Corren en el VPS, junto a compose.yml:
#
#   ./respaldar.sh              un respaldo ahora (lo que hace el cron cada noche)
#   ./respaldar.sh --ensayar    un respaldo ahora y, además, su ensayo de restauración (sin esperar a la semana)
#   ./respaldar.sh --instalar   lo deja en el cron del usuario, cada noche a las 3:15 (hora del servidor)
#   ./respaldar.sh --quitar     lo quita del cron
#
# Un respaldo es el volcado de la base y su «huella» (huella.sql: las filas de cada tabla y lo que suma el
# libro de pagos), tomados en la misma instantánea, con la versión en marcha, en un .tar cifrado para la clave
# pública del local (respaldo-destinatario.pem, junto a .env; se crea con ./restaurar.sh --clave-nueva en otra
# máquina). La privada no está aquí: sin ella el archivo no se abre. Queda en respaldos/diarios/ (los últimos
# 7) y la web se lo sirve a la PC del local preparada en Ajustes → Sistema → Respaldos, que lo baja y lo confirma.
# Cómo terminó va a la base (backup_copy) con su asiento: el panel lo enseña, también si falló.
#
# Una vez por semana (B7-6), el volcado de esa noche, ANTES de cifrarlo, se restaura en una base de usar y tirar
# (la misma imagen de PostgreSQL, sin red ni volumen) y se le calcula otra vez la huella: íntegro si coincide con la
# que se tomó al respaldar. Va a backup_rehearsal y el panel y Inicio lo dicen. Aquí no se puede descifrar (la clave
# privada no está): que el archivo cifrado llegó entero lo comprueba la PC del local con su huella.
#
# Un respaldo fijado en el panel (backup_pin, B7-6) no lo quita la retención: se queda aunque pasen las noches.
#
# Sin la clave pública no se respalda (fail-closed): un volcado sin cifrar no sale del servidor.

set -euo pipefail
cd "$(dirname "$0")"
GUION=$(pwd)/$(basename "$0")

ETIQUETA_ENV=etiqueta.env
DESTINATARIO=respaldo-destinatario.pem
DIARIOS=respaldos/diarios
QUE_SE_GUARDAN=${L2_RESPALDOS_QUE_SE_GUARDAN:-7}
# El ensayo es semanal: si el último tiene menos de esto, esta noche no se ensaya.
ENSAYO_CADA_HORAS=${L2_RESPALDOS_ENSAYO_CADA_HORAS:-160}
IMAGEN_ENSAYO=postgres:17.11-alpine
ENSAYAR=no

dc() { docker compose --env-file .env --env-file "$ETIQUETA_ENV" "$@"; }
decir() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
del_env() { sed -n "s/^$1=//p" .env | tail -n 1; }
en_marcha() { sed -n 's/^L2_ETIQUETA=//p' "$ETIQUETA_ENV" 2>/dev/null || true; }
# Docker para el ensayo. En Git Bash (Windows, el ensayo en la PC del técnico) Docker no entiende /c/Users/…: la ruta
# del volumen va en su forma de Windows, y a lo que empieza por «/» no se le convierte nada (como restaurar.sh).
ruta() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
dk() { MSYS_NO_PATHCONV=1 docker "$@"; }

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

# ¿Toca ensayar esta noche? Si se pidió, si nunca se ensayó o si el último ensayo tiene más de una semana.
toca_ensayar() {
  [ "$ENSAYAR" = si ] && return 0
  local horas
  horas=$(sql <<<"SELECT coalesce(floor(extract(epoch FROM now() - max(at)) / 3600)::int, 100000) FROM backup_rehearsal WHERE tenant_id = :'t';" 2>/dev/null) || return 1
  [ "${horas:-0}" -ge "$ENSAYO_CADA_HORAS" ]
}

# El ensayo de restauración (B7-6): el volcado de esta noche en una base de usar y tirar, y su huella otra vez.
# Escribe en la base cómo le fue (íntegro, o qué falló) con su asiento. No para el respaldo si falla: lo anota.
ensayar() { # carpeta-del-volcado id-del-respaldo
  local tmp=$1 id=$2 inicio obtenida esperada resumen intento detalle integro
  inicio=$(date +%s)
  ensayo="l2-ensayo-respaldo-$$"
  decir "Ensayando la restauración en una base de usar y tirar…"
  detalle=""
  if ! dk run -d --name "$ensayo" --network none \
    -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" -e L2_MIGRATOR_PASSWORD="$(openssl rand -hex 16)" -e L2_APP_PASSWORD="$(openssl rand -hex 16)" \
    -e L2_BASES=l2control -e L2_MIGRADOR_CREA_BASES=no \
    -e POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale-provider=builtin --builtin-locale=C.UTF-8" \
    -v "$(ruta "$(pwd)/../postgres/init"):/docker-entrypoint-initdb.d:ro" "$IMAGEN_ENSAYO" >/dev/null 2>"$tmp/ensayo.err"; then
    detalle="No se pudo arrancar la base de ensayo: $(head -c 200 "$tmp/ensayo.err")"
  else
    # Lista cuando terminó de arrancar del todo (la primera vez arranca dos veces) y ya existen los papeles.
    for intento in $(seq 90); do
      if [ "$(dk logs "$ensayo" 2>&1 | grep -c 'database system is ready to accept connections')" -ge 2 ] &&
        [ "$(dk exec "$ensayo" psql -U postgres -d l2control -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'l2_app'" 2>/dev/null)" = "1" ]; then
        break
      fi
      [ "$intento" -lt 90 ] || { detalle="La base de ensayo no arrancó en 90 s."; break; }
      sleep 1
    done
  fi
  if [ -z "$detalle" ] && ! dk exec -i "$ensayo" pg_restore -U postgres -d l2control --exit-on-error --single-transaction <"$tmp/l2control.dump" 2>"$tmp/ensayo.err"; then
    detalle="pg_restore no pudo restaurarlo: $(head -c 200 "$tmp/ensayo.err")"
  fi
  if [ -z "$detalle" ]; then
    obtenida=$(grep -v '^--' huella.sql | tr '\n' ' ' | dk exec -i "$ensayo" psql -U postgres -d l2control -X -q -A -t -v ON_ERROR_STOP=1 2>"$tmp/ensayo.err") ||
      detalle="No se pudo calcular la huella de la base restaurada: $(head -c 200 "$tmp/ensayo.err")"
  fi
  if [ -z "$detalle" ]; then
    esperada=$(cat "$tmp/huella.json")
    [ "$obtenida" = "$esperada" ] || detalle="La base restaurada no tiene la huella del respaldo: le faltan o le sobran filas."
  fi
  if [ -z "$detalle" ]; then
    resumen=$(dk exec "$ensayo" psql -U postgres -d l2control -X -q -A -t -F ' ' -c \
      "SELECT count(*), sum((xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', table_name), false, true, '')))[1]::text::bigint), (SELECT count(*) FROM payment) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'" 2>/dev/null || true)
    local tablas filas pagos
    read -r tablas filas pagos <<<"$resumen"
    detalle="${tablas:-?} tablas, ${filas:-?} filas, ${pagos:-?} asientos en el libro de pagos; la huella coincide."
    integro=true
  else
    integro=false
  fi
  dk rm -f "$ensayo" >/dev/null 2>&1 || true
  ensayo=""
  local segundos=$(($(date +%s) - inicio))
  sql -v c="$id" -v i="$integro" -v s="$segundos" -v d="$detalle" <<'SQL' || decir "No se pudo anotar el ensayo en la base."
WITH e AS (
  INSERT INTO backup_rehearsal (id, tenant_id, copy_id, intact, seconds, detail)
  VALUES (gen_random_uuid(), :'t', :'c'::uuid, :'i'::boolean, :'s'::int, :'d')
  RETURNING id)
INSERT INTO audit_log (id, tenant_id, branch_id, action, outcome, entity_type, entity_id, after)
SELECT gen_random_uuid(), :'t', :'b', 'respaldo.ensayar', 'HECHO', 'backup_copy', :'c', jsonb_build_object('integro', :'i'::boolean, 'segundos', :'s'::int, 'detalle', :'d')
FROM e;
SQL
  if [ "$integro" = true ]; then decir "ÍNTEGRO en ${segundos} s: $detalle"; else decir "NO ÍNTEGRO: $detalle"; fi
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
  ensayo=""
  # El volcado sin cifrar vive solo mientras dura esto; la base de ensayo, tampoco queda.
  trap 'rm -rf "${tmp:-}"; [ -z "${ensayo:-}" ] || dk rm -f "$ensayo" >/dev/null 2>&1 || true' EXIT
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

  local id_copia
  id_copia=$(sql -v f="$nombre" -v n="$bytes" -v h="$sha" -v v="$VERSION" <<'SQL'
WITH c AS (
  INSERT INTO backup_copy (id, tenant_id, state, file, bytes, sha256, version)
  VALUES (gen_random_uuid(), :'t', 'HECHO', :'f', :'n'::bigint, :'h', NULLIF(:'v', ''))
  RETURNING id),
a AS (
  INSERT INTO audit_log (id, tenant_id, branch_id, action, outcome, entity_type, entity_id, after)
  SELECT gen_random_uuid(), :'t', :'b', 'respaldo.hacer', 'HECHO', 'backup_copy', c.id::text, jsonb_build_object('archivo', :'f', 'bytes', :'n'::bigint)
  FROM c)
SELECT id FROM c;
SQL
)
  decir "Hecho: $nombre ($(du -h "$DIARIOS/$nombre" | cut -f1), sha256 $sha)."
  # Una vez por semana, el ensayo de restauración con el volcado de esta noche (que todavía está sin cifrar en $tmp).
  if [[ $id_copia =~ ^[0-9a-f-]{36}$ ]] && toca_ensayar; then ensayar "$tmp" "$id_copia"; fi

  # Aquí se guardan las últimas noches, y los fijados aunque sean viejos (B7-6); la PC del local guarda la escalera larga.
  local viejo fijados
  fijados=$(sql <<<"SELECT c.file FROM backup_pin p JOIN backup_copy c ON c.tenant_id = p.tenant_id AND c.id = p.copy_id WHERE p.tenant_id = :'t' AND p.released_at IS NULL;" 2>/dev/null || true)
  for viejo in $(ls -1 "$DIARIOS"/l2control-*.l2r 2>/dev/null | sort -r | grep -vxF -f <(printf '%s\n' $fijados | sed "s|^|$DIARIOS/|") | tail -n +$((QUE_SE_GUARDAN + 1))); do
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
    -h | --help) sed -n '3,26p' "$GUION" | sed 's/^# \{0,1\}//' ;;
    --ensayar) ENSAYAR=si; respaldar ;;
    "") respaldar ;;
    *) echo "No conozco «$1». Mira ./respaldar.sh --help" >&2; exit 2 ;;
  esac
}
main "$@"; exit $?
