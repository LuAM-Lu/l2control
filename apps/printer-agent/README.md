# @l2/printer-agent

El agente de impresión de la laptop de caja (ADR-026). El servidor está en la nube y no alcanza la
impresora del local; este programa sí: se conecta **hacia fuera** al worker (Socket.io, espacio
`/impresion`), recibe los trabajos de su sucursal ya compuestos en ESC/POS y los manda a la impresora por
**TCP 9100** en la red del local (antes pregunta por el papel; si no hay, el trabajo falla con ese motivo) o, por
**USB** (B5-4), a la impresora de Windows de su equipo por su nombre, en modo directo (RAW): PowerShell llama a
`winspool.drv`, sin módulos nativos (`src/windows.ts`). Al conectarse cuenta las impresoras que ve en Windows; sin
contarlas, el servidor no le da trabajos por USB.
Si el servidor lo rechaza un momento o se cae la red, vuelve a intentarlo solo, sin rendirse nunca.

## Instalarlo en la laptop de caja

1. **Descargarlo**: Ajustes → Impresoras → «Descargar el agente» (`l2-impresion.exe`, un solo archivo; la
   laptop no necesita Node ni el proyecto). La pantalla enseña su huella SHA-256 para comprobarlo. El
   programa no va firmado: Windows puede avisar «Windows protegió su PC» → «Más información» →
   «Ejecutar de todas formas».
2. **Pedir el código**: en la misma pantalla, «Vincular» (vale 10 minutos). Enseña la dirección del servidor
   y el código, con un botón para copiarlos.
3. **Doble clic en `l2-impresion.exe`** y pegar lo copiado. Windows pide permiso de administrador una vez.
   El asistente comprueba el servidor, se vincula y se instala en `C:\ProgramData\L2 Control\Impresion\`
   como la tarea de Windows **«L2 Control - Impresion»**:
   - arranca sola al encender la laptop, con la cuenta del sistema, antes de que nadie entre;
   - no abre ninguna ventana;
   - si se cae, Windows la vuelve a levantar cada minuto.
4. Imprimir una **prueba** desde Ajustes → Impresoras y encender la impresora.

Volver a abrir `l2-impresion.exe` enseña su estado (tarea, servidor, últimas líneas del registro) y deja
imprimir una prueba, vincularlo otra vez o desinstalarlo. Las mismas cosas por consola:

```text
l2-impresion instalar [<servidor> <código>]   instala y deja corriendo la tarea
l2-impresion estado                            tarea, servidor y últimas líneas del registro
l2-impresion probar <ip> [puerto] [ancho]      imprime una prueba sin pasar por el servidor
l2-impresion desinstalar                       quita la tarea y la credencial
```

El registro está en `C:\ProgramData\L2 Control\Impresion\agente.log` (se rota al pasar de 1 MB). La
credencial (`agente.json`) solo la leen el sistema y la administración del equipo; retirar el agente desde
el panel la invalida y lo desconecta en el acto.

## Se actualiza solo (T-8c, ADR-028 punto 5)

Instalado, el agente dice su versión al servidor al conectarse y le pregunta cuál hay
(`/descargas/agente/version`, con su credencial): al arrancar, cada 30 minutos y cuando administración pulsa
«Actualizar ahora» en Ajustes → Impresoras (el worker se lo dice al momento). Si hay una posterior:

1. **vacía la cola** (no se cambia con papel pendiente);
2. **la descarga** del propio servidor (`/descargas/agente/archivo`) y **comprueba su huella** SHA-256 contra la
   publicada; si no coincide, no instala nada y lo cuenta;
3. **prueba que arranca**: el ejecutable nuevo tiene que responder `version` con su número;
4. **se cambia en otra tarea de Windows**, «L2 Control - Impresion (cambio)»: lo que lanzara el agente moriría con
   su tarea. Esa tarea espera a que el agente se cierre, guarda el anterior (`l2-impresion.anterior.exe`), pone el
   nuevo y arranca la del agente. Si el nuevo no queda vivo en 90 s (su `arranque.json`, estable a los 15 s), para la
   tarea, **vuelve a poner el anterior** y la arranca otra vez.

El resultado (`actualizacion.json`) lo cuenta el agente que quede al conectarse, y el panel lo enseña: «Se actualizó
a la X», «La X no se instaló: su descarga no tenía la huella publicada» o «La X no arrancó: volvió la anterior». Una
versión que falló aquí no se vuelve a probar sola (`versiones-fallidas.json`); «Actualizar ahora» sí. Un servidor
que volvió a una versión anterior no arrastra al agente hacia atrás, salvo que se pida.

Solo empaquetado y en Windows: sin empaquetar dice «desarrollo» y no se actualiza. **Un agente instalado antes de
la 0.86.0 no sabe actualizarse**: se instala una vez el de esta versión y desde ahí lo hace solo.

**Ensayarlo en una PC sin ser administrador** (se hizo así en T-8c): dos ejecutables con versiones distintas, uno
instalado en una carpeta de prueba y vinculado con `vincular <servidor> <código> --config <carpeta>\agente.json`, con
`"tarea": "<nombre de una tarea propia>"` en ese `agente.json` y esa tarea registrada a nombre del usuario (los mismos
ajustes que `registrarTarea`, con `-AtLogOn`). El otro, con su `.sha256` y su `.version`, en `dist/`, que sirve la web.
En desarrollo la web y el worker van en puertos distintos: la vinculación guarda también la dirección de la web
(`"web"`), que el worker manda si conoce `L2_URL_PUBLICA`.

## Construirlo

```bash
pnpm agente:empaquetar        # apps/printer-agent/dist/l2-impresion.exe, su .sha256 y su .version (en Windows, Node 24)
```

En desarrollo el agente corre sin empaquetar: `node --experimental-strip-types src/main.ts vincular <servidor>
<código>` y después `… iniciar`. Se prueba contra la impresora real del local (por red, TCP 9100); sus pruebas
levantan su propio servidor TCP de prueba y no necesitan ninguna.

## Qué NO le corresponde

- **La base y la aplicación.** Solo habla por la red (`pnpm arch` lo impone): una laptop del local no
  lleva credenciales del servidor.
- **Qué se imprime.** Los bytes los compone el servidor; el agente no sabe de recibos ni de comandas.

```bash
pnpm test    # 16 pruebas: lo que llega a la impresora (con un servidor TCP de prueba), reconexión, USB (con un
             # PowerShell de mentira), instalación y
             # la actualización (cuándo, la huella equivocada, el que no arranca, la tarea del cambio)
```
