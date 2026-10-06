# infra/produccion — L2 Control en el servidor

Cómo corre L2 Control en el VPS (staging y producción) y cómo se pone una versión nueva sin miedo
(T-8a, [ADR-021](../../docs/adr/021-servidor-en-la-nube.md), [ADR-028](../../docs/adr/028-actualizaciones.md)).

| Archivo | Qué es |
|---|---|
| `compose.yml` | PostgreSQL 17, Valkey 8, la web, el worker y Caddy. Solo Caddy abre puertos (80 y 443) |
| `Caddyfile` | HTTPS automático (Let's Encrypt) y el reparto: el canal en vivo al worker, lo demás a la web |
| `desplegar.sh` | Respaldo → migraciones → versión nueva → salud; si no queda sana, vuelve sola a la anterior |
| `entorno.ejemplo` | Las variables del `.env` del servidor (sin valores) |
| `../docker/Dockerfile` | Las tres imágenes: `web`, `worker` y `migrar` |

Lo que el servidor guarda junto a estos archivos y **nunca** entra al repositorio: `.env` (las claves),
`etiqueta.env` (la versión en marcha), `historial.log` (cada despliegue y su resultado) y `respaldos/`
(el volcado de la base antes de cada despliegue; se guardan los diez últimos).

## De dónde salen las versiones

Una etiqueta `vX.Y.Z` en `main` (la pone quien fusiona, M-20) dispara `.github/workflows/publicar.yml`:
empaqueta el agente de impresión en Windows con su huella, crea el «release» con las novedades del
CHANGELOG y publica `ghcr.io/luam-lu/l2control-{web,worker,migrar}:X.Y.Z`. **Publicar no actualiza
ningún servidor.** El CI construye las tres imágenes en cada PR: una que no construye no entra en `main`.

## Poner el servidor por primera vez (B7-1)

En un VPS Linux con Docker y su plugin de compose, con los puertos 80 y 443 abiertos:

```bash
git clone https://github.com/LuAM-Lu/l2control.git /srv/l2control
cd /srv/l2control/infra/produccion
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
cd /srv/l2control && git pull --ff-only    # trae este guion y el compose de esa versión
cd infra/produccion && ./desplegar.sh 0.54.0
./desplegar.sh --estado                    # la versión en marcha y la salud de la web y el worker
```

El guion descarga las imágenes, **respalda la base** (sin respaldo no migra), migra, arranca la versión
nueva y pregunta a la web y al worker por `/salud` hasta dos minutos: tienen que responder con la versión
pedida y la base contestando. Si no, **vuelve a la anterior** y lo anota en `historial.log`. Volver
atrás no toca datos: las migraciones solo expanden (ADR-028), así que la versión anterior funciona con
la base nueva. Si fallan las migraciones, la versión anterior sigue en marcha sin cambios.

Mientras no exista T-8b (Ajustes → Sistema), el despliegue en producción se hace a mano con este guion y
**solo sin turnos abiertos ni niños en sala**.

## Ensayar la vuelta atrás

```bash
L2_FORZAR_FALLO_SALUD=si ./desplegar.sh 0.54.0   # falla a propósito: queda la que estaba
```

Ensayado en local el 2026-10-06 (Caddy en `https://localhost`, imágenes construidas en la PC con
`L2_REGISTRO=local` y `L2_SIN_DESCARGAR=si`): primera instalación de la 0.52.3; la 0.53.0 con la
comprobación forzada a fallar volvió a la 0.52.3; una 0.54.0 cuya salud respondía otra versión volvió a la
0.52.3; la 0.53.0 sin forzar quedó en marcha.
