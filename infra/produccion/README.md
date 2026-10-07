# infra/produccion — L2 Control en el servidor

Cómo corre L2 Control en el VPS (staging y producción) y cómo se pone una versión nueva sin miedo
(T-8a, [ADR-021](../../docs/adr/021-servidor-en-la-nube.md), [ADR-028](../../docs/adr/028-actualizaciones.md)).

| Archivo | Qué es |
|---|---|
| `compose.yml` | PostgreSQL 17, Valkey 8, la web, el worker y Caddy. Solo Caddy abre puertos (80 y 443) |
| `Caddyfile` | HTTPS automático (Let's Encrypt) y el reparto: el canal en vivo al worker, lo demás a la web |
| `desplegar.sh` | Respaldo → migraciones → versión nueva → salud; si no queda sana, vuelve sola a la anterior |
| `actualizador.sh` | Cada minuto (cron): ve las versiones publicadas, pone la que pidió administración (o sola, en staging) con `desplegar.sh` y escribe en la base cómo terminó (T-8b) |
| `entorno.ejemplo` | Las variables del `.env` del servidor (sin valores) |
| `../docker/Dockerfile` | Las tres imágenes: `web`, `worker` y `migrar` |

Lo que el servidor guarda junto a estos archivos y **nunca** entra al repositorio: `.env` (las claves),
`etiqueta.env` (la versión en marcha), `historial.log` (cada despliegue y su resultado), `respaldos/`
(el volcado de la base antes de cada despliegue; se guardan los diez últimos) y `actualizador.log` (lo que
hizo el actualizador).

## De dónde salen las versiones

Una etiqueta `vX.Y.Z` en `main` (la pone quien fusiona, M-20) dispara `.github/workflows/publicar.yml`:
empaqueta el agente de impresión en Windows con su huella, crea el «release» con las novedades del
CHANGELOG y publica `ghcr.io/luam-lu/l2control-{web,worker,migrar}:X.Y.Z`. **Publicar no pone la versión
en ningún servidor:** la ve el actualizador (abajo), que en staging la pone solo y en producción espera a que la
pida administración. El CI construye las tres imágenes en cada PR: una que no construye no entra en `main`.

## Poner el servidor por primera vez (B7-1)

En un VPS Linux con Docker y su plugin de compose, con los puertos 80 y 443 abiertos y el usuario que despliega
en el grupo `docker` (así no necesita `sudo`). El staging (B7-1, 2026-10-07): Ubuntu 24.04, 4 CPU y 8 GB, usuario
`luami`, en `~/l2control`, abierto en `https://217-216-48-54.sslip.io`:

```bash
git clone https://github.com/LuAM-Lu/l2control.git ~/l2control
cd ~/l2control/infra/produccion
cp entorno.ejemplo .env && chmod 600 .env
./desplegar.sh --claves          # pega lo que imprime en .env
nano .env                        # L2_ENTORNO, L2_DOMINIO y L2_URL_PUBLICA
```

**Sin dominio comprado (M-22):** `L2_DOMINIO=<ip-con-guiones>.sslip.io` (con la IP `203.0.113.5`,
`203-0-113-5.sslip.io`) y `L2_URL_PUBLICA=https://` + lo mismo. Con una IP sola no hay llaves de
acceso (el navegador exige un nombre) ni cámara (exige HTTPS). Las llaves quedan atadas a ese nombre:
cambiarlo después obliga a cada persona a crear la suya otra vez.

Si las imágenes de ghcr.io son privadas, el servidor entra una vez con un token de solo lectura
(`read:packages`): `docker login ghcr.io -u <usuario>`.

```bash
./desplegar.sh 0.53.0            # la versión publicada que se quiere poner
docker compose --env-file .env --env-file etiqueta.env logs web | grep codigoDeInstalacion
```

Con la base vacía, la web escribe en su registro el **código de instalación**: se abre
`https://<L2_DOMINIO>/acceso`, «Instalar L2 Control», y se escribe (ADR-020). Cada arranque emite uno
nuevo; después de instalar no vuelve a salir.

## Poner una versión nueva

```bash
cd ~/l2control && git pull --ff-only    # trae este guion y el compose de esa versión
cd infra/produccion && ./desplegar.sh 0.54.0
./desplegar.sh --estado                    # la versión en marcha y la salud de la web y el worker
```

El guion descarga las imágenes, **respalda la base** (sin respaldo no migra), migra, arranca la versión
nueva y pregunta a la web y al worker por `/salud` hasta dos minutos: tienen que responder con la versión
pedida y la base contestando. Si no, **vuelve a la anterior** y lo anota en `historial.log`. Volver
atrás no toca datos: las migraciones solo expanden (ADR-028), así que la versión anterior funciona con
la base nueva. Si fallan las migraciones, la versión anterior sigue en marcha sin cambios.

A mano, solo **sin turnos abiertos ni niños en sala**. Lo normal es dejárselo al actualizador.

## El actualizador (T-8b)

Se instala una vez por servidor, y desde entonces las versiones se ponen desde el panel:

```bash
sudo apt install jq                       # además de curl y flock, que Ubuntu ya trae
cd ~/l2control/infra/produccion && ./actualizador.sh --instalar   # en el cron del usuario, cada minuto
tail -f actualizador.log                  # lo que va haciendo (solo escribe cuando hace algo)
```

Cada minuto, con un cerrojo para que no se pisen dos pasadas:

1. **Mira las versiones publicadas** (cada cinco minutos: la API de GitHub sin token da 60 consultas por hora). Una
   versión entra en la base cuando su «release» existe **y** sus tres imágenes ya están en ghcr.io (el «release» se
   crea antes de que terminen). Solo las más nuevas que la que está en marcha. Las novedades son la sección del
   CHANGELOG; una versión es **urgente** si esa sección tiene un apartado `### Urgente` (el panel lo destaca).
2. **En staging** (`L2_ENTORNO=staging`) pide sola la más nueva. Una que ya volvió atrás o falló no la vuelve a pedir:
   se corrige con la siguiente.
3. **Pone la pedida cuando toca.** En producción la pide administración en Ajustes → Versión y actualizaciones; el
   actualizador comprueba otra vez que no haya turnos abiertos ni niños en sala (la misma regla que el panel, y una
   «ahora» que se encuentra un turno recién abierto espera como una «al cierre»). La toma con la condición en la base
   (si administración la canceló en ese instante, no se pone), hace `git pull --ff-only`, llama a `./desplegar.sh` y
   escribe el resultado: puesta, vuelta atrás (con el motivo del historial) o fallida. Cada paso deja su asiento en la
   auditoría, así que el panel se entera en vivo.

La web solo **pide**: no toca Docker ni el servidor. Lo que escribe el actualizador va a la base como superusuario
desde el contenedor de PostgreSQL, con los valores como variables de `psql` (nada de fuera se pega en el SQL). Si una
pasada se corta a mitad (el servidor se reinició), la siguiente la cierra según lo que quedó en marcha.

Tras una versión nueva, cada pantalla abierta se pone al día sola en cuanto está libre (sin un diálogo abierto, sin
el cursor en un campo, sin un borrador sin enviar); si no, lo avisa abajo. Una pantalla vieja no puede hacer nada
contra el servidor nuevo: sus acciones ya no existen y se niegan.

`./actualizador.sh --quitar` lo saca del cron. Para ensayarlo en una PC sin GitHub: `L2_SIN_DESCARGAR=si` (imágenes
locales, sin `git pull`) y `L2_RELEASES_ARCHIVO=lista.json` (las versiones de un archivo con la forma de la API).

## Ensayar la vuelta atrás

```bash
L2_FORZAR_FALLO_SALUD=si ./desplegar.sh 0.54.0   # falla a propósito: queda la que estaba
```

Ensayado en el VPS el 2026-10-07: la 0.53.1 con la comprobación forzada a fallar volvió a la 0.53.0, y después
la 0.53.1 quedó en marcha. Antes, en local, el 2026-10-06 (Caddy en `https://localhost`, imágenes construidas en la PC con
`L2_REGISTRO=local` y `L2_SIN_DESCARGAR=si`): primera instalación de la 0.52.3; la 0.53.0 con la
comprobación forzada a fallar volvió a la 0.52.3; una 0.54.0 cuya salud respondía otra versión volvió a la
0.52.3; la 0.53.0 sin forzar quedó en marcha.

El actualizador, en local el 2026-10-07 con la 0.58.0 y una 0.58.1 construidas en la PC: pedida «ahora» desde el
panel, puesta en 6 s con respaldo, y las pantallas abiertas se pusieron al día solas (la que tenía el cursor en un
campo avisó y esperó a soltarlo); con un turno abierto, «ahora» desactivado y una «al cierre» que esperó sin poner
nada hasta cancelarla; en staging, una 0.58.2 que respondía otra versión se pidió sola, volvió a la 0.58.1 con el
motivo en el panel y no se volvió a pedir.
