# @l2/printer-agent

El agente de impresión de la laptop de caja (ADR-026). El servidor está en la nube y no alcanza la
impresora del local; este programa sí: se conecta **hacia fuera** al worker (Socket.io, espacio
`/impresion`), recibe los trabajos de su sucursal ya compuestos en ESC/POS y los manda a la impresora por
**TCP 9100** en la red del local. Antes pregunta por el papel; si no hay, el trabajo falla con ese motivo.
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

## Construirlo

```bash
pnpm agente:empaquetar        # apps/printer-agent/dist/l2-impresion.exe y su .sha256 (en Windows, Node 24)
```

En desarrollo el agente corre sin empaquetar: `node --experimental-strip-types src/main.ts vincular <servidor>
<código>` y después `… iniciar`. Se prueba contra la impresora real del local (por red, TCP 9100); sus pruebas
levantan su propio servidor TCP de prueba y no necesitan ninguna.

## Qué NO le corresponde

- **La base y la aplicación.** Solo habla por la red (`pnpm arch` lo impone): una laptop del local no
  lleva credenciales del servidor.
- **Qué se imprime.** Los bytes los compone el servidor; el agente no sabe de recibos ni de comandas.

```bash
pnpm test    # 6 pruebas: lo que llega a la impresora (con un servidor TCP de prueba), reconexión e instalación
```
