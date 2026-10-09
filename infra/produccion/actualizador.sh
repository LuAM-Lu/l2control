#!/usr/bin/env bash
#
# El actualizador del servidor (T-8b, ADR-028, M-25). Corre cada minuto en el VPS (cron) y hace cuatro cosas:
#
#   1. mira las versiones publicadas (los «release» de GitHub con sus tres imágenes ya en ghcr.io) y las
#      apunta en la base para que Ajustes → Sistema las enseñe con sus novedades;
#   2. en staging, pide sola la más nueva (en producción la pide administración desde el panel);
#   3. si hay una pedida y es su momento, la pone con ./desplegar.sh y escribe en la base cómo terminó;
#   4. si administración pidió «Respaldar ahora» (B7-8), lo hace con ./respaldar.sh y escribe cómo terminó.
#
#   ./actualizador.sh              una pasada (lo que hace el cron)
#   ./actualizador.sh --instalar   lo deja en el cron del usuario, cada minuto (una vez por servidor)
#   ./actualizador.sh --quitar     lo quita del cron
#
#   L2_SIN_DESCARGAR=si            pruebas en local: imágenes de la PC, sin git pull (como desplegar.sh)
#   L2_RELEASES_ARCHIVO=x.json     pruebas en local: las versiones de un archivo con la forma de la API de GitHub
#
# «Su momento»: sin turnos de caja abiertos ni niños en sala (la misma regla que el panel), salvo en staging,
# que se pone al día solo. La web solo pide: esto lo hace el servidor, con respaldo y vuelta atrás sola.
# Necesita curl, jq y flock. Lo que hace queda en actualizador.log.

set -euo pipefail
cd "$(dirname "$0")"
GUION=$(pwd)/$(basename "$0")
RAIZ=$(cd ../.. && pwd)

ETIQUETA_ENV=etiqueta.env
HISTORIAL=historial.log
CERROJO=.actualizador.lock
CONSULTADA=.actualizador.consultada
CONSULTAR_CADA_MIN=5 # la API de GitHub sin token da 60 consultas por hora
REPOSITORIO=${L2_REPOSITORIO:-LuAM-Lu/l2control}

dc() { docker compose --env-file .env --env-file "$ETIQUETA_ENV" "$@"; }
decir() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
en_marcha() { sed -n 's/^L2_ETIQUETA=//p' "$ETIQUETA_ENV" 2>/dev/null || true; }
del_env() { sed -n "s/^$1=//p" .env | tail -n 1; }
# «a» es más nueva que «b», número a número.
mas_nueva() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]; }

# La base, como superusuario desde su contenedor (la web y el worker no pueden escribir esto por su
# cuenta). El SQL entra por la entrada estándar; los valores, como variables de psql (`:'nombre'`), que
# psql cita: nada de lo que viene de fuera se pega en el SQL.
sql() {
  dc exec -T postgres psql -U postgres -d l2control -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 \
    -v t="$TENANT" -v b="$SUCURSAL" "$@"
}

# El asiento de auditoría: así el panel se entera en vivo (el disparador lo lleva al outbox y el
# worker lo cuenta). Sin persona: lo hizo el servidor.
auditar() { # id versión estado detalle
  sql -v id="$1" -v v="$2" -v e="$3" -v d="$4" <<'SQL'
INSERT INTO audit_log (id, tenant_id, branch_id, action, outcome, entity_type, entity_id, after)
VALUES (gen_random_uuid(), :'t', :'b', 'sistema.resultado', 'HECHO', 'system_update', :'id',
        jsonb_build_object('version', :'v', 'estado', :'e', 'detalle', NULLIF(:'d', '')));
SQL
}

terminar() { # id versión estado detalle
  sql -v id="$1" -v e="$3" -v d="$4" <<'SQL'
UPDATE system_update SET state = :'e', finished_at = now(), detail = NULLIF(:'d', '')
 WHERE tenant_id = :'t' AND id = :'id' AND state IN ('PEDIDA', 'EN_CURSO');
SQL
  auditar "$@"
  decir "$2: $3${4:+ · $4}"
}

# Lo mismo que el panel (`ocupado` en @l2/application): turnos sin su Z y niños en sala. Una estancia
# huérfana (de otro día, o de más horas que las del ajuste) no cuenta.
ocupado() {
  sql <<'SQL'
WITH ajuste AS (
  SELECT COALESCE(content->>'zonaHoraria', 'America/Caracas') AS zona,
         COALESCE((content->>'horasHuerfana')::float8, 8) AS horas
    FROM branch_settings_version WHERE tenant_id = :'t' AND branch_id = :'b'
   ORDER BY version DESC LIMIT 1
), a AS (
  SELECT * FROM ajuste UNION ALL SELECT 'America/Caracas', 8 WHERE NOT EXISTS (SELECT 1 FROM ajuste)
)
SELECT (SELECT count(*) FROM cash_shift WHERE tenant_id = :'t' AND branch_id = :'b' AND status <> 'CERRADO_Z')
     + (SELECT count(*) FROM park_session s, a
         WHERE s.tenant_id = :'t' AND s.branch_id = :'b' AND s.status = 'ACTIVA'
           AND s.started_at >= (date_trunc('day', now() AT TIME ZONE a.zona) AT TIME ZONE a.zona)
           AND now() - s.started_at <= a.horas * interval '1 hour');
SQL
}

# Las tres imágenes de una versión están publicadas (en pruebas, construidas en la PC).
imagenes_listas() { # versión
  local registro t
  registro=$(del_env L2_REGISTRO)
  registro=${registro:-ghcr.io/luam-lu}
  for t in web worker migrar; do
    if [ "${L2_SIN_DESCARGAR:-no}" = "si" ]; then
      docker image inspect "$registro/l2control-$t:$1" </dev/null >/dev/null 2>&1 || return 1
    else
      docker manifest inspect "$registro/l2control-$t:$1" </dev/null >/dev/null 2>&1 || return 1
    fi
  done
}

# 1 · Las versiones publicadas, cada pocos minutos. Solo las más nuevas que la que está en marcha, y solo
# cuando sus imágenes ya están (el «release» se crea antes de que terminen de publicarse).
consultar_versiones() {
  local marcha=$1 lista v publicada notas urgente
  if [ -z "${L2_RELEASES_ARCHIVO:-}" ] && [ -f "$CONSULTADA" ] && [ -n "$(find "$CONSULTADA" -mmin -"$CONSULTAR_CADA_MIN")" ]; then
    return 0
  fi
  lista=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$lista'" RETURN
  if [ -n "${L2_RELEASES_ARCHIVO:-}" ]; then
    cp "$L2_RELEASES_ARCHIVO" "$lista"
  elif ! curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$REPOSITORIO/releases?per_page=30" -o "$lista"; then
    decir "GitHub no contestó: se mira otra vez en $CONSULTAR_CADA_MIN minutos."
    touch "$CONSULTADA"
    return 0
  fi
  touch "$CONSULTADA"
  jq -r '.[] | select((.draft | not) and (.prerelease | not)) | select(.tag_name | test("^v[0-9]+\\.[0-9]+\\.[0-9]+$"))
             | [(.tag_name | ltrimstr("v")), .published_at] | @tsv' "$lista" |
    while IFS=$'\t' read -r v publicada; do
      mas_nueva "$v" "$marcha" || continue
      [ "$(sql -v v="$v" <<<"SELECT count(*) FROM system_release WHERE tenant_id = :'t' AND version = :'v';")" = "0" ] || continue
      if ! imagenes_listas "$v"; then
        decir "La $v está publicada pero sus imágenes todavía no: se mira otra vez luego."
        continue
      fi
      notas=$(jq -r --arg t "v$v" '.[] | select(.tag_name == $t) | .body // ""' "$lista")
      # Una versión urgente lo dice su CHANGELOG con un apartado «### Urgente».
      if printf '%s\n' "$notas" | grep -Eq '^###[[:space:]]+Urgente'; then urgente=true; else urgente=false; fi
      sql -v v="$v" -v p="$publicada" -v n="$notas" -v u="$urgente" <<'SQL'
INSERT INTO system_release (id, tenant_id, version, published_at, notes, urgent)
VALUES (gen_random_uuid(), :'t', :'v', :'p'::timestamptz, :'n', :'u'::boolean)
ON CONFLICT (tenant_id, version) DO NOTHING;
SQL
      if [ "$urgente" = true ]; then decir "Publicada y lista: la $v (urgente)."; else decir "Publicada y lista: la $v."; fi
    done
}

# 2 · En staging, la más nueva se pide sola. Una que ya falló no se vuelve a pedir sola (si no, se
# intentaría cada minuto): se corrige con otra versión.
pedir_sola() {
  local marcha=$1
  sql -v m="$marcha" <<'SQL'
INSERT INTO system_update (id, tenant_id, version, from_version, mode, state)
SELECT gen_random_uuid(), :'t', r.version, :'m', 'AUTOMATICA', 'PEDIDA'
  FROM system_release r
 WHERE r.tenant_id = :'t'
   AND string_to_array(r.version, '.')::int[] > string_to_array(:'m', '.')::int[]
   AND NOT EXISTS (SELECT 1 FROM system_update u WHERE u.tenant_id = :'t' AND u.state IN ('PEDIDA', 'EN_CURSO'))
   AND NOT EXISTS (SELECT 1 FROM system_update u WHERE u.tenant_id = :'t' AND u.version = r.version AND u.state IN ('VUELTA_ATRAS', 'FALLIDA'))
 ORDER BY string_to_array(r.version, '.')::int[] DESC
 LIMIT 1
ON CONFLICT DO NOTHING;
SQL
}

# Una que quedó EN_CURSO de una pasada que murió (el servidor se reinició a mitad): con el cerrojo en la
# mano, nadie la está poniendo. Se mira cómo quedó y se cierra.
recoger_interrumpidas() {
  local marcha=$1 id v
  while IFS=$'\t' read -r id v; do
    [ -n "$id" ] || continue
    if [ "$v" = "$marcha" ]; then
      terminar "$id" "$v" HECHA "Se cortó al final, pero quedó en marcha."
    else
      terminar "$id" "$v" FALLIDA "Se cortó a mitad. Sigue la $marcha."
    fi
  done < <(sql <<<"SELECT id, version FROM system_update WHERE tenant_id = :'t' AND state = 'EN_CURSO';")
}

# Lo que dejó desplegar.sh en su historial para esa versión en esta pasada (solo las líneas que añadió),
# dicho para quien lo lee en el panel.
resultado_de() { # versión anterior líneas-que-había
  local linea estado
  linea=$(tail -n +"$(($3 + 1))" "$HISTORIAL" 2>/dev/null | awk -F'\t' -v v="$1" '$2 == v' | tail -n 1)
  estado=$(printf '%s' "$linea" | cut -f3)
  case "$estado" in
    "EN MARCHA") echo "HECHA	" ;;
    "VUELTA ATRAS") echo "VUELTA_ATRAS	No quedó sana y volvió sola a la $2. No se perdió nada." ;;
    "VUELTA ATRAS SIN SALUD") echo "FALLIDA	No quedó sana y la $2 tampoco responde: hay que revisar el servidor." ;;
    "NO DESCARGADA") echo "FALLIDA	No se pudieron descargar sus imágenes. No se tocó nada." ;;
    "SIN ESPACIO") echo "FALLIDA	El servidor no tiene espacio para descargarla, ni borrando las versiones viejas. No se tocó nada." ;;
    "SIN RESPALDO") echo "FALLIDA	El respaldo falló y sin respaldo no se migra. No se tocó nada." ;;
    "MIGRACION FALLIDA") echo "FALLIDA	Las migraciones fallaron. Sigue la $2, sin cambios." ;;
    "SIN SALUD") echo "FALLIDA	No quedó sana y no había versión anterior." ;;
    *) echo "FALLIDA	El despliegue terminó sin decir cómo: mira actualizador.log." ;;
  esac
}

# 3 · La pedida, si es su momento.
poner_la_pedida() {
  local marcha=$1 automatico=$2 id v modo n desde inicio lineas res estado detalle
  IFS=$'\t' read -r id v modo < <(sql <<<"SELECT id, version, mode FROM system_update WHERE tenant_id = :'t' AND state = 'PEDIDA' ORDER BY requested_at LIMIT 1;") || true
  [ -n "${id:-}" ] || return 0

  if [ "$v" = "$marcha" ]; then
    terminar "$id" "$v" HECHA "Ya estaba en marcha."
    return 0
  fi
  if ! mas_nueva "$v" "$marcha"; then
    terminar "$id" "$v" FALLIDA "Ya está en marcha la $marcha, más nueva."
    return 0
  fi
  # En producción, solo sin operación. Una «ahora» que se encuentra un turno recién abierto espera
  # como una «al cierre»: no se corta a nadie.
  if [ "$automatico" != "si" ]; then
    n=$(ocupado)
    [ "$n" = "0" ] || return 0
  fi

  # Se toma con la condición en el WHERE: si administración la canceló en este instante, no se pone.
  desde=$(sql -v id="$id" <<<"UPDATE system_update SET state = 'EN_CURSO', started_at = now() WHERE tenant_id = :'t' AND id = :'id' AND state = 'PEDIDA' RETURNING version;")
  [ -n "$desde" ] || return 0
  auditar "$id" "$v" EN_CURSO ""
  decir "Poniendo la $v (${modo}, en marcha la $marcha)…"
  inicio=$(date +%s)

  # El guion y el compose de esa versión (en pruebas, los que hay).
  if [ "${L2_SIN_DESCARGAR:-no}" != "si" ] && [ -d "$RAIZ/.git" ]; then
    if ! git -C "$RAIZ" pull --ff-only --quiet; then
      terminar "$id" "$v" FALLIDA "No se pudo traer el guion de despliegue (git pull). No se tocó nada."
      return 0
    fi
  fi

  lineas=$(wc -l <"$HISTORIAL" 2>/dev/null || echo 0)
  ./desplegar.sh "$v" </dev/null || true
  res=$(resultado_de "$v" "$marcha" "$lineas")
  estado=${res%%	*}
  detalle=${res#*	}
  if [ "$estado" = "HECHA" ]; then detalle="Puesta en $(($(date +%s) - inicio)) s, con respaldo antes."; fi
  terminar "$id" "$v" "$estado" "$detalle"
}

# 4 · «Respaldar ahora» (B7-8, M-35): el respaldo pedido desde el panel se hace en esta pasada con respaldar.sh (el
# mismo de cada noche) y se anota cómo terminó, con el respaldo que salió. Uno a la vez: lo cuida la base.
auditar_respaldo() { # id estado detalle
  sql -v id="$1" -v e="$2" -v d="$3" <<'SQL'
INSERT INTO audit_log (id, tenant_id, branch_id, action, outcome, entity_type, entity_id, after)
VALUES (gen_random_uuid(), :'t', :'b', 'respaldo.pedido', 'HECHO', 'backup_request', :'id',
        jsonb_build_object('estado', :'e', 'detalle', NULLIF(:'d', '')));
SQL
}

terminar_respaldo() { # id estado copia detalle
  sql -v id="$1" -v e="$2" -v c="$3" -v d="$4" <<'SQL'
UPDATE backup_request SET state = :'e', finished_at = now(), copy_id = NULLIF(:'c', '')::uuid, detail = NULLIF(:'d', '')
 WHERE tenant_id = :'t' AND id = :'id' AND state IN ('PEDIDO', 'EN_CURSO');
SQL
  auditar_respaldo "$1" "$2" "$4"
  decir "Respaldo pedido desde el panel: $2${4:+ · $4}"
}

respaldar_pedido() {
  local id copia estado detalle
  # Sin la tabla (una base todavía sin la migración de la 0.110.0), nada: no se corta la pasada.
  [ "$(sql <<<"SELECT to_regclass('backup_request') IS NOT NULL;")" = "t" ] || return 0
  # Uno que quedó EN_CURSO de una pasada que murió (con el cerrojo en la mano, nadie lo está haciendo).
  while read -r id; do
    if [ -n "$id" ]; then terminar_respaldo "$id" FALLIDO "" "Se cortó a mitad (el servidor se reinició): pídelo otra vez."; fi
  done < <(sql <<<"SELECT id FROM backup_request WHERE tenant_id = :'t' AND state = 'EN_CURSO';")

  # Se toma con la condición en el WHERE: uno solo, aunque dos pasadas lo miren a la vez.
  id=$(sql <<<"UPDATE backup_request SET state = 'EN_CURSO', started_at = now() WHERE tenant_id = :'t' AND state = 'PEDIDO' RETURNING id;")
  [ -n "$id" ] || return 0
  auditar_respaldo "$id" EN_CURSO ""
  decir "Respaldo pedido desde el panel: respaldando…"
  ./respaldar.sh >>respaldos.log 2>&1 </dev/null || true
  # Lo que respaldar.sh anotó desde que empezó: hecho con su archivo, o fallido con su motivo.
  copia="" estado="" detalle=""
  IFS=$'\t' read -r copia estado detalle < <(sql -v id="$id" <<'SQL'
SELECT c.id, c.state, coalesce(c.detail, '')
  FROM backup_copy c JOIN backup_request r ON r.tenant_id = c.tenant_id AND r.id = :'id'
 WHERE c.tenant_id = :'t' AND c.made_at >= r.started_at
 ORDER BY c.made_at DESC LIMIT 1;
SQL
  ) || true
  if [ -z "$copia" ]; then
    terminar_respaldo "$id" FALLIDO "" "respaldar.sh terminó sin anotar el respaldo: mira respaldos.log en el servidor."
  elif [ "$estado" = "HECHO" ]; then
    terminar_respaldo "$id" HECHO "$copia" ""
  else
    terminar_respaldo "$id" FALLIDO "$copia" "${detalle:-sin motivo}"
  fi
}

pasada() {
  local marcha entorno automatico
  [ -f .env ] || { decir "Falta .env junto a compose.yml."; exit 2; }
  command -v jq >/dev/null || { decir "Falta jq (sudo apt install jq)."; exit 2; }
  marcha=$(en_marcha)
  # Sin etiqueta pero con la web en marcha (se borró: el disco lleno lo hacía antes de la 0.104.1), se rehace con la
  # versión de su imagen, en vez de quedarse parado creyendo que no hay nada desplegado.
  if [ -z "$marcha" ]; then
    marcha=$(docker ps --filter label=com.docker.compose.service=web --format '{{.Image}}' 2>/dev/null | head -n 1 | sed -n 's/^.*:\([0-9][0-9.]*\)$/\1/p')
    if [ -n "$marcha" ]; then
      printf 'L2_ETIQUETA=%s\n' "$marcha" >"$ETIQUETA_ENV.nuevo" && mv -f "$ETIQUETA_ENV.nuevo" "$ETIQUETA_ENV" &&
        decir "Faltaba $ETIQUETA_ENV: se rehízo con la versión en marcha, la $marcha."
    fi
  fi
  # Sin versión desplegada todavía, no hay nada que actualizar: la primera se pone a mano.
  [ -n "$marcha" ] && [ -f "$ETIQUETA_ENV" ] || exit 0
  TENANT=$(del_env L2_TENANT_ID)
  SUCURSAL=$(del_env L2_BRANCH_ID)
  entorno=$(del_env L2_ENTORNO)
  if [ "$entorno" = "staging" ]; then automatico=si; else automatico=no; fi

  # Una pasada a la vez: un despliegue tarda más de un minuto.
  exec 9>"$CERROJO"
  flock -n 9 || exit 0
  # Sin base no se decide nada (fail-closed): la próxima pasada lo intenta otra vez.
  [ "$(sql <<<"SELECT 1;" 2>/dev/null)" = "1" ] || exit 0

  recoger_interrumpidas "$marcha"
  # El respaldo pedido va antes que lo demás: quien lo pidió está mirando el panel.
  respaldar_pedido
  consultar_versiones "$marcha"
  [ "$automatico" = "si" ] && pedir_sola "$marcha"
  poner_la_pedida "$marcha" "$automatico"
}

LINEA_CRON="* * * * * $GUION >> $(pwd)/actualizador.log 2>&1"

# Todo en funciones y la llamada con su `exit` en una línea: `git pull` puede cambiar este archivo
# mientras corre, y bash lo va leyendo a medida que avanza.
main() {
  case "${1:-}" in
    --instalar)
      { crontab -l 2>/dev/null | grep -vF "$GUION" || true; echo "$LINEA_CRON"; } | crontab -
      echo "En el cron, cada minuto: $LINEA_CRON"
      ;;
    --quitar)
      { crontab -l 2>/dev/null | grep -vF "$GUION" || true; } | crontab -
      echo "Quitado del cron."
      ;;
    -h | --help) sed -n '3,20p' "$GUION" | sed 's/^# \{0,1\}//' ;;
    "") pasada ;;
    *) echo "No conozco «$1». Mira ./actualizador.sh --help" >&2; exit 2 ;;
  esac
}
main "$@"; exit $?
