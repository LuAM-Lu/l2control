# Runbooks del técnico

Lo que hace quien atiende L2 Control cuando algo pasa, paso a paso (B8-2, M-30). Cómo está montado el servidor y de
dónde salen las versiones está en [README.md](README.md); el manual de cada pantalla, en la ayuda de la app (botón
«?»). Esto es para el técnico, no para el personal: el personal tiene la ayuda y, sin sistema, la hoja del
procedimiento en papel (`/procedimiento-papel`, para imprimir y pegar junto a la caja).

Cada runbook dice **cuándo** se usa, **qué hace falta**, **los pasos** y **cómo se sabe que salió**. Las órdenes del
servidor se escriben en `~/l2control/infra/produccion` del VPS, con el usuario que despliega.

| # | Runbook | Cuándo |
|---|---|---|
| 1 | [Restaurar un respaldo](#1-restaurar-un-respaldo) | Cada mes (ensayo), o se perdió el servidor o su base |
| 2 | [Volver atrás una actualización](#2-volver-atrás-una-actualización) | Una versión nueva quedó mal |
| 3 | [El equipo que sustituye a uno perdido](#3-el-equipo-que-sustituye-a-uno-perdido) | Se perdió, se dañó o se robaron un equipo del local |
| 4 | [Cambiar la impresora](#4-cambiar-la-impresora) | La impresora se dañó o se cambia |
| 5 | [Los feriados de cada año](#5-los-feriados-de-cada-año) | Diciembre o enero, con el calendario del BCV |
| 6 | [La laptop de caja no enciende](#6-la-laptop-de-caja-no-enciende) | En plena jornada |
| 7 | [El agente de impresión no imprime](#7-el-agente-de-impresión-no-imprime) | Nada sale en papel |
| 8 | [Se cayeron los dos enlaces](#8-se-cayeron-los-dos-enlaces) | Sin internet principal ni 4G |

**Dos reglas que valen para todos:**

- **Siempre dos personas de administración con sus credenciales y dos equipos de administración aprobados** (M-7). Con
  una sola, perder su equipo o su llave deja el local sin quien apruebe equipos ni confirme identidad. La Puesta a
  punto de Inicio lo recuerda («Segunda administración»).
- **Fuera del servidor**, y nunca en el repositorio: el `.env` del servidor (sus claves), la clave privada de los
  respaldos con su frase y los códigos de recuperación de cada administración. Sin la clave privada y su frase, un
  respaldo no se abre.

---

## 1. Restaurar un respaldo

**Hace falta:** la PC del técnico con Docker y Git Bash (o Linux), la carpeta de respaldos de la PC del local (la que
se eligió en Ajustes → Sistema → Respaldos) y la clave privada del local (`respaldo-clave-privada.pem`) con su frase.

### a) El ensayo de cada mes (PLAN §10.4)

1. Copia a la PC del técnico el respaldo más reciente de la carpeta de la PC del local (`l2control-AAAAMMDDTHHMMSSZ.l2r`).
2. `infra/produccion/restaurar.sh <respaldo.l2r> <respaldo-clave-privada.pem>`: pide la frase, lo descifra, lo
   restaura en un PostgreSQL de usar y tirar y compara su huella.
3. **Salió** si termina con **ÍNTEGRO** y dice cuánto tardó. Anótalo (fecha, respaldo, segundos). Si dice que no
   coincide, prueba con el de la noche anterior y avisa: el servidor ensaya cada semana el suyo (Ajustes → Sistema →
   Respaldos), pero el ensayo con la clave del local es este.

### b) Se perdió el servidor (o su base no sirve)

1. **Antes de tocar nada**, si el servidor viejo responde: guarda su `respaldos/` y su `historial.log`.
2. Un VPS nuevo como en «Poner el servidor por primera vez» (README), con el **`.env` de siempre**: las mismas
   `L2_TENANT_ID`, `L2_BRANCH_ID` y `L2_CLAVE_CIFRADO` (las contraseñas pueden ser nuevas). Si el dominio cambia, las
   llaves de acceso de cada persona dejan de valer: entran con contraseña y código de recuperación y se crean otra.
3. En la PC del técnico, el volcado del último respaldo bueno:
   `infra/produccion/restaurar.sh <respaldo.l2r> <clave-privada.pem> --volcado l2control.dump` y súbelo al servidor nuevo.
4. En el servidor nuevo, **antes** de desplegar: la base vacía, el volcado dentro y la versión que estaba en marcha
   (la dice el ensayo del paso 3):

   ```bash
   echo "L2_ETIQUETA=<versión>" > etiqueta.env
   docker compose --env-file .env --env-file etiqueta.env up -d --wait postgres
   docker compose --env-file .env --env-file etiqueta.env exec -T postgres pg_restore -U postgres -d l2control --exit-on-error --single-transaction < l2control.dump
   rm l2control.dump etiqueta.env && ./desplegar.sh <versión>
   ```

5. El actualizador (`./actualizador.sh --instalar`) y los respaldos (`./respaldar.sh && ./respaldar.sh --instalar`, con
   la misma `respaldo-destinatario.pem`). En el panel, Ajustes → Sistema → Respaldos: la PC del local se prepara otra
   vez (su credencial era del servidor viejo).
6. **Salió** si `./desplegar.sh --estado` dice la versión y la salud, se entra con el PIN y Inicio enseña el día.
   **Se puede perder hasta un día de trabajo** (un respaldo por noche): lo de ese día, si hubo corte, está en papel
   (runbook 8); si no, se vuelve a registrar a mano lo que falte, con su motivo.

## 2. Volver atrás una actualización

`desplegar.sh` ya vuelve solo: si la versión nueva no responde sana en dos minutos, pone la anterior y lo anota
(`historial.log`, el panel lo dice en Ajustes → Sistema). Esto es para cuando **quedó en marcha pero algo no va**.

1. Mira qué está en marcha y cómo terminó: `./desplegar.sh --estado` y `tail -n 20 historial.log`.
2. **Sin turnos abiertos ni niños en sala** (la misma regla que el panel), pon la anterior: `./desplegar.sh <anterior>`.
   No toca datos: las migraciones solo expanden (ADR-028), así que la versión anterior funciona con la base nueva.
3. Las pantallas abiertas se ponen al día solas al quedar libres. El agente de impresión **no** vuelve atrás solo (no
   sigue a un servidor que retrocede): sigue funcionando con la anterior.
4. Repórtalo con lo que pasó: la versión que falló no se vuelve a pedir sola en staging, y en producción no se pide
   hasta que administración la pida. Se corrige con la siguiente.
5. **Salió** si `--estado` dice la anterior con salud, y la operación sigue (un cobro de prueba en staging).

## 3. El equipo que sustituye a uno perdido

**Hace falta:** el equipo nuevo con el navegador, y una persona de administración con sus credenciales (contraseña y
su app de autenticación, su llave o un código de recuperación).

1. **Revoca el perdido** en Ajustes → Personas y equipos → Dispositivos → «Revocar», con el motivo («Tablet robada el
   12/10»). Sus sesiones se cierran en el acto; no se borra (sus asientos lo nombran).
2. En el **equipo nuevo**, `/acceso` → nombre del equipo («Tablet salón 2») → «Pedir registro». Enseña un código.
3. **Apruébalo** en Dispositivos comparando el código con el de su pantalla. Si no hay a mano otro equipo de
   administración, «Soy de administración» en el propio equipo nuevo, con la contraseña y el segundo factor.
4. Según lo que era:
   - **La laptop de caja:** márcala «Punto de cobro» (el botón de la cartera) para que abra su turno sin pedir nada.
     Instala ahí el **agente de impresión** (runbook 7) y retira el agente viejo en Ajustes → Impresoras → Agente.
   - **Un equipo de administración:** si era el equipo de confianza de alguien, «Retirar la confianza» en su ficha
     (Ajustes → Personas y equipos → Usuarios y permisos → la persona → Credenciales). Si en él estaba su llave de
     acceso (la del propio equipo, como Windows Hello), «Reponer credenciales» en esa misma ficha: le llega un enlace
     nuevo para su contraseña, su llave y sus códigos, y los viejos dejan de valer. Comprueba que siguen **dos equipos
     de administración aprobados**.
   - **El teléfono de la monitora o la tablet del mesero:** solo aprobarlo; la persona entra con su PIN.
5. **Salió** si la persona entra con su PIN en el equipo nuevo y el revocado ya no aparece en «¿Quién entra?» desde él.

## 4. Cambiar la impresora

**Hace falta:** la impresora nueva conectada a la red del local, con **IP fija** (reserva en el router) y en la **red
de hardware**; o por **USB** a la laptop de caja, con su controlador instalado **para todo el equipo** (el agente
corre con la cuenta del sistema y no ve las impresoras de un solo usuario). Su ancho de papel (80 o 58 mm).

1. Ajustes → Impresoras → «Nueva impresora»: nombre, «Conectada por» (red: IP y puerto 9100; USB: el equipo y su
   nombre en Windows, de la lista que da el agente), ancho y para qué (recibos y cortes, comandas). Nace **apagada**.
2. «Probar»: sale una hoja de prueba por el agente. Si no sale, revisa la IP, el cable y el papel (runbook 7); por USB,
   que el agente de ese equipo esté al día y que Windows la vea.
3. En «Editar», «Imprimir la prueba de acentos»: sale el mismo texto con cada página de códigos, numerado. En «Página de las tildes», elige la
   que se leyó bien (las genéricas, como la Xprinter XP-80C, suelen ir con la 850). Si sale pálido, «Impresión
   oscura»; si sigue pálido, la densidad se sube con la utilidad de la impresora.
4. **Apaga o retira la vieja** (una sola encendida por papel: el sistema no deja dos para lo mismo) y **enciende la
   nueva**. Retirarla no la borra: su historial queda.
5. El agente de impresión no cambia: llega a cualquier IP de la red; por USB, imprime la del equipo donde está.
6. **Salió** si un recibo de prueba (Caja → un cobro, o Ajustes → Impresoras → «Probar») y una comanda salen en la
   nueva.

## 5. Los feriados de cada año

**Cuándo:** cuando el BCV publica el calendario de feriados bancarios del año siguiente (diciembre o enero). Carnaval
y Semana Santa cambian cada año.

1. Ajustes → Tasas de cambio → Feriados: cada fecha con su nombre.
2. **Para qué sirve:** un feriado bancario el BCV no publica tasa; el sistema usa sola la del día hábil anterior
   (B2-4). Sin el feriado cargado, ese día pide la tasa a mano y la caja no cobra en bolívares hasta confirmarla.
3. La Puesta a punto de Inicio lo recuerda si no hay ninguno.
4. **Salió** si la lista del año tiene todas las fechas del calendario del BCV.

## 6. La laptop de caja no enciende

1. **El turno se abre en otro equipo** (una tablet o el equipo de administración): Caja → Turno pide el **PIN de
   administración y el motivo** («La laptop de caja no enciende»), porque no es el punto de cobro (B3-9). Queda en la
   auditoría e Inicio lo avisa mientras siga abierto.
2. **La impresión vive en la laptop** (su agente): sin ella no salen recibos ni comandas. El mesero avisa a la cocina
   de palabra; los recibos se imprimen después desde Ventas. Si va para largo, instala el agente en otro equipo con
   Windows de la red del local (runbook 7) y retíralo cuando vuelva la laptop.
3. Cuando vuelve la laptop: en el equipo de emergencia, «Cambiar de cajera» (arqueo y corte Z de ese turno) y se abre
   el turno en la laptop, que sigue siendo el punto de cobro.
4. Si la laptop no vuelve: runbook 3 con la nueva (marcarla punto de cobro y su agente).

## 7. El agente de impresión no imprime

1. Ajustes → Impresoras: ¿el agente dice **Conectado**? ¿La impresora está encendida y el último trabajo, qué dice?
2. En la laptop de caja, abre `l2-impresion.exe` (doble clic): enseña la tarea («corriendo»), si llega al servidor y
   las últimas líneas del registro (`C:\ProgramData\L2 Control\Impresion\agente.log`).
   - **No llega al servidor:** el internet de la laptop. Lo enviado espera en la cola y sale solo al volver.
   - **«El servidor no reconoce este agente»:** se retiró desde el panel. Vincúlalo otra vez (opción 2 del asistente,
     con un código nuevo de Ajustes → Impresoras → Agente → «Vincular»).
   - **No llega a la impresora:** «Imprimir una prueba» (opción 1) con su IP; revisa cable, papel e IP fija.
3. **Reinstalarlo:** «Descargar el agente» en Ajustes → Impresoras, en la laptop; doble clic; pide permiso de
   administrador una vez y el código de «Vincular». Retira el agente viejo en el panel.
4. **Se actualiza solo** (T-8c): con cada versión del sistema que trae otra del agente, la baja, comprueba su huella y
   se cambia con la cola vacía. El panel dice su versión y cómo le fue al último cambio. Si dice «La X no arrancó:
   volvió la anterior», sigue imprimiendo con la anterior: repórtalo. La tarea «L2 Control - Impresion (cambio)» es la
   que hace los cambios: no se borra. Un agente instalado antes de la 0.86.0 no sabe actualizarse: se reinstala una vez.
5. **Salió** si «Probar» en Ajustes → Impresoras saca la hoja y lo que esperaba en la cola sale solo.

## 8. Se cayeron los dos enlaces

1. El internet principal pasa solo al 4G (ADR-021). Si caen los dos (o la luz sin batería en el router), el local
   pasa al **papel**: la hoja del procedimiento pegada junto a la caja dice quién anota qué, y los formularios están
   en la carpeta (Caja → Papel → «Imprimir los formularios» y «El procedimiento en papel»).
2. Lo del técnico: revisa el router principal y el 4G (luz, saldo del 4G, el cable). El servidor está en la nube y
   sigue en marcha: lo que falta es el camino del local hasta él.
3. Al volver: la cajera carga el papel en Caja → Papel y supervisión lo revisa con su PIN; sin revisar, no se cierra
   el turno ni la jornada.
4. **Salió** si las cargas de papel quedaron revisadas y el corte Z del día las cuenta («Desde papel» en las ventas).
