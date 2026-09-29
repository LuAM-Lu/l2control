# @l2/worker

El proceso aparte del servidor web (ADR-006). Nace en B5-1 con tres trabajos:

1. **El canal en vivo** (`canal.ts`): Socket.io con adaptador Valkey (ADR-008) en `/tiempo-real`. La
   autorización ocurre en el apretón de manos, con un ticket que firma el servidor web para quien tiene
   sesión (ADR-025). Cada conexión entra en la sala de su tenant y la de su sucursal, y de ahí no sale.
2. **La vuelta del outbox** (`outbox.ts`): la base avisa (`LISTEN l2_outbox`) al confirmarse cada
   transacción con eventos, y el worker publica **qué temas cambiaron** (`sala`, `cuentas`, `tasas`…)
   a cada sucursal. Barre cada 5 s por si un aviso se perdió. Cada minuto confirma que las sesiones con
   el canal abierto siguen vivas (latido) y cierra el de las que murieron.
3. **Los trabajos programados** (`tasa.ts`): la consulta de la tasa del BCV cada 15 minutos (antes, en el
   arranque de la web).

Además, provisionalmente, **el bus del restaurante** (`operacion.ts`): los eventos `mesa.*` y `pedido.*`
que se cuentan las pantallas, revalidados, con la hora del servidor, con tope por conexión y guardados
por sucursal en Valkey un día. Se va cuando mesas y pedidos sean de la base (Etapa 6).

## Arrancar

`pnpm dev` en la raíz lo levanta junto a la web (con `--watch`). Solo: `pnpm --filter @l2/worker dev`.
Salud: `GET http://localhost:3001/salud`.

Variables (se validan al arrancar; sin ellas no arranca): las de la base y el local que usa la web
(`L2_DB_APP_URL`, `L2_TENANT_ID`, `L2_BRANCH_ID`, **la misma** `L2_CLAVE_CIFRADO`, `L2_ENTORNO`,
`L2_LOG_LEVEL`) más `L2_VALKEY_URL`, `L2_TIEMPO_REAL_PUERTO` (3001) y `L2_SINCRONIZAR_TASA`.

En `pnpm dev`, turbo para todo si una tarea se cae: si el worker no arranca (Valkey apagado), tampoco
queda la web. En producción son dos procesos independientes.

## Qué no le corresponde

- **Escribir en la base por una pantalla.** Toda operación pasa por la web y sus acciones; el worker
  solo marca lo publicado del outbox, apunta el latido de las sesiones y trae la tasa.
- **Mandar datos por el canal.** Solo temas: cada pantalla vuelve a leer con sus permisos (ADR-025).
- **Importar `@l2/database`.** Como la web, llega a la base por `@l2/application` (`pnpm arch`).
- **La cola de impresión** llega en B5-2, aquí mismo.
