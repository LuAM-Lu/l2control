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
#
# El disco (0.104.1): cada versión son unos 3 GB de imágenes. Antes de descargar se mira que quepan (si no, se borran
# las de versiones viejas) y, con la nueva en marcha, se borran todas menos ella y la anterior, que es la vuelta atrás.
# En el staging se llenaron 96 GB con 145 imágenes y la 0.94.0 ya no se pudo descargar.

set -euo pipefail
cd "$(dirname "$0")"
GUION=./$(basename "$0")

ETIQUETA_ENV=etiqueta.env
HISTORIAL=historial.log
RESPALDOS=respaldos
RESPALDOS_QUE_SE_GUARDAN=10
# Lo que hace falta libre para descargar una versión (sus tres imágenes, con holgura), en GB.
LIBRE_PARA_DESCARGAR_GB=${L2_LIBRE_PARA_DESCARGAR_GB:-6}
INTENTOS_DE_SALUD=${L2_INTENTOS_DE_SALUD:-40} # cada 3 s: dos minutos para arrancar

dc() { docker compose --env-file .env --env-file "$ETIQUETA_ENV" "$@"; }
decir() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
anotar() { printf '%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$HISTORIAL"; }
en_marcha() { sed -n 's/^L2_ETIQUETA=//p' "$ETIQUETA_ENV" 2>/dev/null || true; }
# Se escribe aparte y se cambia de una vez: con el disco lleno, el archivo de antes se queda entero en vez de vacío.
poner_etiqueta() { printf 'L2_ETIQUETA=%s\n' "$1" >"$ETIQUETA_ENV.nuevo" && mv -f "$ETIQUETA_ENV.nuevo" "$ETIQUETA_ENV"; }
# Lo que estaba antes de este despliegue. Con `a && b || c`, si escribir la anterior fallaba (disco lleno) se BORRABA la
# etiqueta, y el actualizador creía que no había nada desplegado: así se quedó parado el staging en la 0.93.0.
volver_etiqueta() { # anterior
  if [ -n "$1" ]; then
    poner_etiqueta "$1" || decir "No se pudo reescribir $ETIQUETA_ENV con la $1: escríbelo a mano (L2_ETIQUETA=$1)."
  else
    rm -f "$ETIQUETA_ENV"
  fi
}

# Los GB libres donde Docker guarda las imágenes. Si no se puede saber, 999: no se frena un despliegue por no poder mirar.
libre_gb() {
  df -P --block-size=1G "$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)" 2>/dev/null |
    awk 'NR == 2 { print $4; visto = 1 } END { if (!visto) print 999 }'
}

# Borra las imágenes de L2 Control de todas las versiones menos las que se dicen. Las de un contenedor en marcha Docker
# no las borra. Las que se borran se pueden volver a descargar: están en ghcr.io.
limpiar_imagenes() { # versiones que se quedan…
  local registro quedan img
  registro=$(sed -n 's/^L2_REGISTRO=//p' .env | tail -n 1)
  registro=${registro:-ghcr.io/luam-lu}
  quedan=" $* "
  # Sin ninguna que borrar, grep no encuentra nada: no es un error (con pipefail lo sería).
  { docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$registro/l2control-" || true; } | while read -r img; do
    case "$quedan" in *" ${img##*:} "*) continue ;; esac
    docker rmi "$img" >/dev/null 2>&1 || true
  done
  docker image prune -f >/dev/null 2>&1 || true
  return 0
}

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

  if [ "${L2_SIN_DESCARGAR:-no}" != "si" ]; then
    # Que quepa: si no, fuera las imágenes de versiones viejas; si aun así no cabe, no se toca nada.
    if [ "$(libre_gb || echo 0)" -lt "$LIBRE_PARA_DESCARGAR_GB" ]; then
      decir "Poco espacio ($(libre_gb || echo '?') GB libres): se borran las imágenes de versiones viejas."
      limpiar_imagenes ${anterior:+"$anterior"}
      if [ "$(libre_gb || echo 0)" -lt "$LIBRE_PARA_DESCARGAR_GB" ]; then
        anotar "$nueva	SIN ESPACIO	sigue ${anterior:-ninguna}"
        echo "No hay $LIBRE_PARA_DESCARGAR_GB GB libres para descargar la $nueva ni borrando las versiones viejas: libera disco (df -h). No se tocó nada." >&2
        exit 1
      fi
    fi
  fi
  poner_etiqueta "$nueva"
  if [ "${L2_SIN_DESCARGAR:-no}" != "si" ]; then
    decir "Descargando las imágenes de la $nueva…"
    if ! dc --profile despliegue pull web worker migrar; then
      volver_etiqueta "$anterior"
      anotar "$nueva	NO DESCARGADA	sigue ${anterior:-ninguna}"
      echo "No se pudieron descargar las imágenes de la $nueva; no se tocó nada." >&2
      exit 1
    fi
  fi

  if ! respaldar "$nueva"; then
    volver_etiqueta "$anterior"
    anotar "$nueva	SIN RESPALDO	sigue ${anterior:-ninguna}"
    echo "El respaldo falló: sin respaldo no se migra (fail-closed). No se tocó nada." >&2
    exit 1
  fi

  decir "Migraciones…"
  if ! dc --profile despliegue run --rm migrar; then
    volver_etiqueta "$anterior"
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
    # Se quedan la nueva y la anterior (la vuelta atrás); las demás ocupan disco sin servir.
    [ "${L2_SIN_DESCARGAR:-no}" = "si" ] || limpiar_imagenes "$nueva" ${anterior:+"$anterior"}
    return 0
  fi

  if [ -z "$anterior" ]; then
    anotar "$nueva	SIN SALUD	no hay versión anterior"
    echo "La $nueva no quedó sana y no hay versión anterior a la que volver: mira 'docker compose logs web worker'." >&2
    exit 1
  fi
  decir "La $nueva no quedó sana: vuelta a la $anterior…"
  volver_etiqueta "$anterior"
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
