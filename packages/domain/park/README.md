# @l2/domain-park

Reglas de estancia del parque: tiempo, gracia, penalización y aforo.
Implementa §6.5, [ADR-010](../../../docs/adr/010-cronometro-del-servidor.md) y
[ADR-011](../../../docs/adr/011-tipos-semanticos.md).

## Qué resuelve

Cuánto tiempo lleva un niño en sala, en qué estado está su estancia, y cuánto se le cobra por
el excedente.

```ts
const view = computeSessionView(session, policy, epochMs(serverNow));
// { status: "POR_VENCER", elapsedMs, remainingMs, overdueMs, billableOverdueMs }

computeOverdueCharge(view, policy);  // Money — bloques iniciados, no proporcional
```

## Las dos decisiones que gobiernan este módulo

**[ADR-010] El instante entra como argumento.** Ninguna función llama a `Date.now()`. El
servidor manda; el cliente solo interpola. Por eso el módulo es determinista y una tablet con
el reloj mal puesto no puede regalar ni cobrar tiempo.

**[ADR-011] No hay números desnudos donde el cero es ambiguo.** «Pase libre» no es duración
cero: es otra variante del tipo.

```ts
fixed(0)                        // ✗ lanza: usa `openEnded`
parkPolicy({ penaltyBlockMinutes: 0, ... })  // ✗ lanza: sería división por cero
parkPolicy({ graceMinutes: 0, ... })         // ✓ válido: «sin gracia», explícito
```

## API pública

| Función | Para qué |
|---|---|
| `computeSessionView` | Estado y tiempos de una estancia en un instante dado |
| `computeOverdueCharge`, `computeSettlement` | Cargo por excedente y liquidación total |
| `computeCapacity` | Aforo configurable, con aviso al alcanzarlo |
| `fixed`, `openEnded`, `parkPolicy`, `minutes`, `epochMs` | Constructores que validan |
| `formatDuration` | Presentación `HH:MM:SS` |

## Nota sobre las pulseras

Son **desechables** (§6.6 del plan): el código identifica **una estancia**, no a un niño ni a un
objeto con historia. Por eso `ParkSession` lleva el código como atributo y no existe una entidad
`Wristband`. La consecuencia que sorprende: al ser preimpresas, un lote nuevo puede repetir
códigos de uno viejo, así que la unicidad vale **solo entre estancias activas**, nunca sobre el
histórico — una unicidad global sobre todo el histórico sería falsa, y rechazaría entradas
legítimas el día que el proveedor reinicie la numeración.

## Qué NO le corresponde

- **Persistencia.** No sabe de base de datos; recibe la sesión ya cargada.
- **Presentación.** El color de la tarjeta lo decide la capa de funcionalidad, no este módulo.
- **Cobro.** Devuelve el importe; quien lo cobra es el módulo de caja.

Depende solo de `@l2/domain-money` (núcleo compartido). Nada de React, Prisma ni red.
