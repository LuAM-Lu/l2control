#!/usr/bin/env bash
#
# Abrir y restaurar un respaldo (B7-4, M-26, PLAN §10.4). Corre FUERA del servidor, donde está la clave privada
# del local (la PC del técnico: Linux, o Git Bash en Windows, con Docker y openssl):
#
#   ./restaurar.sh --clave-nueva <carpeta>
#       El par de claves del local, una vez: la pública (respaldo-destinatario.pem) va al servidor, junto a .env;
#       la privada (respaldo-clave-privada.pem) y su frase se guardan fuera del servidor, como L2_CLAVE_CIFRADO.
#
#   ./restaurar.sh <respaldo.l2r> <respaldo-clave-privada.pem> [--conservar] [--volcado <destino.dump>]
#       El ensayo de restauración (F10-05): lo descifra, lo restaura en una base limpia y calcula otra vez su
#       huella (huella.sql). Íntegro = la misma que se tomó al respaldar. Dice cuánto tardó (el RTO del ensayo).
#       --conservar deja la base del ensayo encendida para mirarla; --volcado guarda el volcado descifrado, para
#       restaurarlo en un servidor nuevo (README, «Volver a levantar el servidor desde un respaldo»).
#
# La frase de la clave se pide al empezar (o en L2_FRASE). Nada de esto toca el servidor.

set -euo pipefail
AQUI=$(cd "$(dirname "$0")" && pwd)
GUION=$AQUI/$(basename "$0")
IMAGEN=postgres:17.11-alpine

decir() { printf '%s  %s\n' "$(date +%H:%M:%S)" "$*"; }
# En Git Bash (Windows) los programas nativos (Docker, openssl) no entienden /c/Users/…: la ruta va en su forma de
# Windows. Y a lo que lleva argumentos que empiezan por «/» (rutas del contenedor, «/CN=…») no se le convierte
# nada. En Linux todo queda igual.
ruta() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
tal_cual() { MSYS_NO_PATHCONV=1 "$@"; }

pedir_frase() { # confirmar
  if [ -n "${L2_FRASE:-}" ]; then return 0; fi
  read -rsp "Frase de la clave privada: " L2_FRASE && echo
  if [ "${1:-}" = "confirmar" ]; then
    local otra
    read -rsp "Otra vez: " otra && echo
    [ "$L2_FRASE" = "$otra" ] || { echo "No coinciden." >&2; exit 2; }
    [ "${#L2_FRASE}" -ge 12 ] || { echo "Al menos 12 caracteres: es lo único que protege la clave." >&2; exit 2; }
  fi
  export L2_FRASE
}

clave_nueva() { # carpeta
  local dir=${1:?falta la carpeta donde dejar las claves}
  mkdir -p "$dir"
  [ ! -e "$dir/respaldo-clave-privada.pem" ] || { echo "Ya hay una clave en $dir: no se pisa." >&2; exit 2; }
  pedir_frase confirmar
  tal_cual openssl req -x509 -newkey rsa:4096 -days 3650 -subj "/CN=L2 Control - respaldos del local" \
    -keyout "$(ruta "$dir/respaldo-clave-privada.pem")" -out "$(ruta "$dir/respaldo-destinatario.pem")" -passout env:L2_FRASE 2>"$dir/.openssl.err" ||
    { cat "$dir/.openssl.err" >&2; rm -f "$dir/.openssl.err"; exit 1; }
  rm -f "$dir/.openssl.err"
  chmod 600 "$dir/respaldo-clave-privada.pem"
  echo "Listo:"
  echo "  $dir/respaldo-destinatario.pem   la pública: cópiala al servidor, junto a .env (scp …/infra/produccion/)"
  echo "  $dir/respaldo-clave-privada.pem  la privada: guárdala fuera del servidor, con su frase y con L2_CLAVE_CIFRADO."
  echo "Sin la privada y su frase, ningún respaldo se puede abrir."
}

ensayar() { # respaldo clave [--conservar] [--volcado destino]
  local respaldo=${1:?falta el respaldo (.l2r)} clave=${2:?falta la clave privada}
  shift 2
  # Globales: la trampa de salida las usa cuando la función ya terminó.
  conservar=no
  local volcado=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --conservar) conservar=si ;;
      --volcado) volcado=${2:?falta el destino del volcado}; shift ;;
      *) echo "No conozco «$1»." >&2; exit 2 ;;
    esac
    shift
  done
  [ -s "$respaldo" ] || { echo "No encuentro $respaldo." >&2; exit 2; }
  pedir_frase

  local inicio esperada obtenida resumen
  tmp=$(mktemp -d)
  contenedor="l2-ensayo-$$"
  trap 'rm -rf "${tmp:-}"; [ "${conservar:-no}" = si ] || [ -z "${contenedor:-}" ] || tal_cual docker rm -f "$contenedor" >/dev/null 2>&1 || true' EXIT
  inicio=$(date +%s)

  decir "Descifrando $(basename "$respaldo")…"
  openssl cms -decrypt -binary -inform DER -in "$respaldo" -inkey "$clave" -passin env:L2_FRASE -out "$tmp/paquete.tar" 2>"$tmp/openssl.err" ||
    { echo "No se pudo descifrar: la clave o la frase no son las de este respaldo, o el archivo está dañado." >&2; head -c 300 "$tmp/openssl.err" >&2; exit 1; }
  tar -C "$tmp" -xf "$tmp/paquete.tar"
  decir "Versión que estaba en marcha: $(cat "$tmp/version.txt")."
  [ -z "$volcado" ] || { cp "$tmp/l2control.dump" "$volcado"; decir "Volcado descifrado en $volcado (trátalo como la base: no lo dejes por ahí)."; }

  decir "Base limpia de ensayo ($IMAGEN)…"
  tal_cual docker run -d --name "$contenedor" \
    -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" -e L2_MIGRATOR_PASSWORD="$(openssl rand -hex 16)" -e L2_APP_PASSWORD="$(openssl rand -hex 16)" \
    -e L2_BASES=l2control -e L2_MIGRADOR_CREA_BASES=no \
    -e POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale-provider=builtin --builtin-locale=C.UTF-8" \
    -v "$(ruta "$AQUI/../postgres/init"):/docker-entrypoint-initdb.d:ro" \
    "$IMAGEN" >/dev/null
  # Lista cuando terminó de arrancar del todo (la primera vez arranca dos veces) y ya existen los papeles.
  local intento
  for intento in $(seq 60); do
    if [ "$(tal_cual docker logs "$contenedor" 2>&1 | grep -c 'database system is ready to accept connections')" -ge 2 ] &&
      [ "$(tal_cual docker exec "$contenedor" psql -U postgres -d l2control -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'l2_app'" 2>/dev/null)" = "1" ]; then
      break
    fi
    [ "$intento" -lt 60 ] || { echo "La base de ensayo no arrancó." >&2; tal_cual docker logs "$contenedor" 2>&1 | tail -5 >&2; exit 1; }
    sleep 1
  done

  decir "Restaurando…"
  tal_cual docker exec -i "$contenedor" pg_restore -U postgres -d l2control --exit-on-error --single-transaction <"$tmp/l2control.dump"

  decir "Comprobando la huella…"
  grep -v '^--' "$AQUI/huella.sql" | tr '\n' ' ' >"$tmp/huella.sql"
  obtenida=$(tal_cual docker exec -i "$contenedor" psql -U postgres -d l2control -X -q -A -t -v ON_ERROR_STOP=1 <"$tmp/huella.sql")
  esperada=$(cat "$tmp/huella.json")
  resumen=$(tal_cual docker exec "$contenedor" psql -U postgres -d l2control -X -q -A -t -F ' ' -c \
    "SELECT count(*), sum((xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', table_name), false, true, '')))[1]::text::bigint), (SELECT count(*) FROM payment) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
  local tablas filas pagos
  read -r tablas filas pagos <<<"$resumen"

  if [ "$obtenida" != "$esperada" ]; then
    echo "NO ÍNTEGRO: la base restaurada no tiene la huella del respaldo." >&2
    echo "Esperada: $esperada" >&2
    echo "Obtenida: $obtenida" >&2
    exit 1
  fi
  decir "ÍNTEGRO: $tablas tablas, $filas filas, $pagos asientos en el libro de pagos; la huella coincide."
  decir "Tiempo del ensayo (descifrar, base limpia, restaurar y comprobar): $(($(date +%s) - inicio)) s."
  if [ "$conservar" = si ]; then
    decir "La base del ensayo sigue encendida: docker exec -it $contenedor psql -U postgres -d l2control (bórrala con docker rm -f $contenedor)."
  fi
}

case "${1:-}" in
  --clave-nueva) clave_nueva "${2:-}" ;;
  "" | -h | --help) sed -n '3,18p' "$GUION" | sed 's/^# \{0,1\}//' ;;
  *) ensayar "$@" ;;
esac
