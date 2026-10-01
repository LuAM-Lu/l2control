# @l2/printer-agent

El agente de impresión de la laptop de caja (ADR-026). El servidor está en la nube y no alcanza la
impresora del local; este programa sí: se conecta **hacia fuera** al worker (Socket.io, espacio
`/impresion`), recibe los trabajos de su sucursal ya compuestos en ESC/POS y los manda a la impresora por
**TCP 9100** en la red del local. Antes pregunta por el papel; si no hay, el trabajo falla con ese motivo.

## Instalarlo en la laptop de caja

1. Ajustes → Impresoras → **Agente de impresión** → «Vincular»: sale un código de un solo uso (10 minutos)
   y la orden exacta.
2. En la laptop, con Node 24: `l2-impresion vincular <servidor> <código>`. Guarda la credencial en
   `~/.l2-impresion/agente.json` (`L2_AGENTE_CONFIG` la cambia). Es una llave: no se copia a otro equipo.
3. `l2-impresion` lo deja corriendo. Vuelve a conectarse solo si se cae el internet, y vacía la cola al
   volver.
4. Para probar la impresora sin servidor: `l2-impresion probar <ip> [puerto] [ancho]`.

Retirar el agente desde el panel invalida su credencial y lo desconecta en el acto.

## Qué NO le corresponde

- **La base y la aplicación.** Solo habla por la red (`pnpm arch` lo impone): una laptop del local no
  lleva credenciales del servidor.
- **Qué se imprime.** Los bytes los compone el servidor; el agente no sabe de recibos ni de comandas.
- **Empaquetarlo como servicio de Windows** (que arranque solo con la laptop): B7-3, con la instalación de
  los equipos.

```bash
pnpm test    # 4 pruebas contra una impresora falsa
```
