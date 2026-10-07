#!/usr/bin/env bash
#
# Pone una versión de L2 Control en el servidor y, si no queda sana, vuelve sola a la anterior
# (T-8a, ADR-028). Corre en el VPS, junto a compose.yml y su .env:
#
#   ./desplegar.sh 0.53.0        respaldo → migraciones → versión nueva → salud; si falla, la anterior
#   ./desplegar.sh --estado      la versión en marcha y su salud
#   ./desplegar.sh --claves      claves nuevas para un .env recién copiado (no toca nada)
#
#   L2_FORZAR_FALLO_SALUD=si ./desplegar.sh 0.53.0   ensayo: la comprobación falla a propósito
#   L2_SIN_DESCARGAR=si ./desplegar.sh 0.53.0        usa las imágenes que ya están (pruebas en local)
#
# Volver atrás es cambiar de imagen, sin tocar datos: las migraciones son de expandir y contraer
# (ADR-028), así que la versión anterior funciona con la base nueva. Lo que pasa queda en historial.log.

set -euo pipefail
cd "$(dirname "$0")"
GUION=./$(basename "$0")

ETIQUETA_ENV=etiqueta.env
HISTORIAL=historial.log
RESPALDOS=respaldos
RESPALDOS_QUE_SE_GUARDAN=10
INTENTOS_DE_SALUD=${L2_INTENTOS_DE_SALUD:-40} # cada 3 s: dos minutos para arrancar

dc() { docker compose --env-file .env --env-file "$ETIQUETA_ENV" "$@"; }
decir() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
anotar() { printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$HISTORIAL"; }
en_marcha() { sed -n 's/^L2_ETIQUETA=//p' "$ETIQUETA_ENV" 2>/dev/null || true; }
poner_etiqueta() { printf 'L2_ETIQUETA=%s\n' "$1" >"$ETIQUETA_ENV"; }

# La salud de un servicio, preguntada desde dentro de su contenedor (no tienen puertos fuera).
salud_de() { # servicio puerto
  dc exec -T "$1" node -e "fetch('http://127.0.0.1:$2/salud').then(async r=>{process.stdout.write(await r.text());process.exit(r.ok?0:1)},()=>process.exit(1))" 2>/dev/null
}

# El Caddyfile viene con cada versión (git pull), pero Caddy solo lo lee al arrancar y `up` no lo reinicia si su
# servicio no cambió. Y no basta con pedirle que lo relea: el contenedor monta ESE archivo, y `git pull` lo
# reemplaza por otro, así que dentro se sigue viendo el viejo (visto en el staging con la 0.60.0). Si el de dentro
# no es el del disco, se recrea Caddy (un corte de un segundo, dentro del despliegue); si es el mismo, se relee
# sin cortar nada. Si no puede, sigue con el que tenía y lo dice.
recargar_caddy() {
  if ! MSYS_NO_PATHCONV=1 dc exec -T caddy cat /etc/caddy/Caddyfile 2>/dev/null | cmp -s - Caddyfile; then
    decir "El Caddyfile cambió: Caddy se recrea para leerlo."
    dc up -d --force-recreate --no-deps caddy >/dev/null 2>&1 ||
      decir "Caddy no se pudo recrear: sigue con la configuración anterior (mira 'docker compose logs caddy')."
    return 0
  fi
  MSYS_NO_PATHCONV=1 dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 ||
    decir "Caddy no recargó su configuración: sigue con la anterior (mira 'docker compose logs caddy')."
}

# Sana = la web y el worker responden 200 con la versión esperada y la base contesta.
comprobar_salud() { # versión
  local esperada=$1 web worker
  if [ "${L2_FORZAR_FALLO_SALUD:-no}" = "si" ]; then
    decir "Comprobación forzada a fallar (L2_FORZAR_FALLO_SALUD=si)."
    return 1
  fi
  for _ in $(seq "$INTENTOS_DE_SALUD"); do
    web=$(salud_de web 3000 || true)
    worker=$(salud_de worker 3001 || true)
    case "$web" in *"\"ok\":true"*"\"version\":\"$esperada\""*)
      case "$worker" in *"\"ok\":true"*"\"version\":\"$esperada\""*) return 0 ;; esac ;;
    esac
    sleep 3
  done
  decir "Sin salud tras $((INTENTOS_DE_SALUD * 3)) s. Web: ${web:-sin respuesta} · worker: ${worker:-sin respuesta}"
  return 1
}

claves() {
  local hex="openssl rand -hex 24"
  echo "# Pégalas en .env (una vez; cambiarlas después obliga a cambiarlas también en la base)."
  echo "L2_TENANT_ID=$(cat /proc/sys/kernel/random/uuid)"
  echo "L2_BRANCH_ID=$(cat /proc/sys/kernel/random/uuid)"
  echo "POSTGRES_PASSWORD=$($hex)"
  echo "L2_MIGRATOR_PASSWORD=$($hex)"
  echo "L2_APP_PASSWORD=$($hex)"
  echo "VALKEY_PASSWORD=$($hex)"
  echo "L2_CLAVE_CIFRADO=$(openssl rand -base64 32)"
}

estado() {
  local v
  v=$(en_marcha)
  if [ -z "$v" ]; then echo "No hay ninguna versión desplegada."; return 0; fi
  echo "En marcha: $v"
  echo "web:    $(salud_de web 3000 || echo 'sin salud')"
  echo "worker: $(salud_de worker 3001 || echo 'sin salud')"
}

respaldar() { # versión nueva
  # respaldos/diarios lo monta la web (B7-4): que exista antes de arrancar, y del usuario, no de Docker.
  mkdir -p "$RESPALDOS/diarios"
  local archivo
  archivo="$RESPALDOS/l2control-$(date -u +%Y%m%dT%H%M%SZ)-antes-de-$1.dump"
  dc up -d --wait postgres >/dev/null
  dc exec -T postgres pg_dump -U postgres -d l2control -Fc >"$archivo"
  if [ ! -s "$archivo" ]; then
    rm -f "$archivo"
    return 1
  fi
  decir "Respaldo: $archivo ($(du -h "$archivo" | cut -f1))"
  # Los de despliegue se guardan unos pocos; el respaldo diario fuera del servidor es B7-4.
  ls -1t "$RESPALDOS"/*.dump | tail -n +$((RESPALDOS_QUE_SE_GUARDAN + 1)) | xargs -r rm -f
}

desplegar() {
  local nueva=${1#v} anterior
  if ! printf '%s' "$nueva" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$'; then
    echo "«$1» no es una versión (X.Y.Z)." >&2
    exit 2
  fi
  [ -f .env ] || { echo "Falta .env junto a compose.yml (copia entorno.ejemplo)." >&2; exit 2; }
  anterior=$(en_marcha)
  if [ "$anterior" = "$nueva" ]; then echo "La $nueva ya está en marcha."; exit 0; fi
  decir "Despliegue de la $nueva (en marcha: ${anterior:-ninguna})."

  poner_etiqueta "$nueva"
  if [ "${L2_SIN_DESCARGAR:-no}" != "si" ]; then
    decir "Descargando las imágenes de la $nueva…"
    if ! dc --profile despliegue pull web worker migrar; then
      [ -n "$anterior" ] && poner_etiqueta "$anterior" || rm -f "$ETIQUETA_ENV"
      anotar "$nueva	NO DESCARGADA	sigue ${anterior:-ninguna}"
      echo "No se pudieron descargar las imágenes de la $nueva; no se tocó nada." >&2
      exit 1
    fi
  fi

  if ! respaldar "$nueva"; then
    [ -n "$anterior" ] && poner_etiqueta "$anterior" || rm -f "$ETIQUETA_ENV"
    anotar "$nueva	SIN RESPALDO	sigue ${anterior:-ninguna}"
    echo "El respaldo falló: sin respaldo no se migra (fail-closed). No se tocó nada." >&2
    exit 1
  fi

  decir "Migraciones…"
  if ! dc --profile despliegue run --rm migrar; then
    [ -n "$anterior" ] && poner_etiqueta "$anterior" || rm -f "$ETIQUETA_ENV"
    anotar "$nueva	MIGRACION FALLIDA	sigue ${anterior:-ninguna}"
    echo "Las migraciones fallaron. ${anterior:+Sigue en marcha la $anterior (las migraciones solo expanden).}" >&2
    exit 1
  fi

  decir "Arrancando la $nueva…"
  dc up -d --remove-orphans web worker caddy
  recargar_caddy
  if comprobar_salud "$nueva"; then
    anotar "$nueva	EN MARCHA	antes ${anterior:-ninguna}"
    decir "La $nueva está en marcha y sana."
    return 0
  fi

  if [ -z "$anterior" ]; then
    anotar "$nueva	SIN SALUD	no hay versión anterior"
    echo "La $nueva no quedó sana y no hay versión anterior a la que volver: mira 'docker compose logs web worker'." >&2
    exit 1
  fi
  decir "La $nueva no quedó sana: vuelta a la $anterior…"
  poner_etiqueta "$anterior"
  dc up -d --remove-orphans web worker caddy
  if L2_FORZAR_FALLO_SALUD=no comprobar_salud "$anterior"; then
    anotar "$nueva	VUELTA ATRAS	en marcha $anterior"
    echo "VUELTA ATRÁS: la $nueva falló la comprobación y sigue en marcha la $anterior." >&2
  else
    anotar "$nueva	VUELTA ATRAS SIN SALUD	$anterior tampoco responde"
    echo "La $anterior tampoco responde: mira 'docker compose logs web worker'." >&2
  fi
  exit 1
}

case "${1:-}" in
  --claves) claves ;;
  --estado) estado ;;
  "" | -h | --help) sed -n '3,15p' "$GUION" | sed 's/^# \{0,1\}//' ;;
  *) desplegar "$1" ;;
esac
