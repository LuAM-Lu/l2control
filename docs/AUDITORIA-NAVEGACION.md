# Auditoría de navegación y permisos

> **Estado (2026-09-17): los diez hallazgos están resueltos**, cada uno anotado bajo su apartado. La
> auditoría queda cerrada; lo que se construya de aquí en adelante se mide contra el
> [plan final del frontend](PLAN-FRONTEND.md). La tabla de §1 es la del 2026-09-14: desde DEC-25 la
> monitora ya no alcanza caja ni ventas.
>
> **Fecha:** 2026-09-14 · **Alcance:** las trece rutas de `apps/web/app`, la matriz de §7.3, el mapa de
> módulos de `navigation.ts`, las dos cáscaras (estación y back-office) y las guardias de cada una.
> **Método:** la matriz se recorrió con el dominio (`can` sobre las 27 acciones × 6 roles) y cada
> hallazgo se reprodujo en el navegador entrando con la persona de ese rol. Nada de lo que sigue es
> una sospecha: todo tiene su evidencia.
>
> **Aviso que vale para toda esta página:** lo que se audita aquí es **experiencia de usuario, no
> seguridad**. Quien controle el navegador se salta cualquiera de estas reglas. La puerta de verdad la
> pone el servidor con esta misma matriz (F2-05), y hoy no existe.

## 1. El mapa real: qué alcanza cada rol

Calculado con `can(actor, SURFACE_ACTION[superficie]) !== "DENEGADO"`, que es la regla 2 de
UX-MEJORAS §3: lo que se puede **con autorización** también aparece, porque el candado se pide en la
acción y no en la puerta.

| Superficie | Administración | Supervisión | Caja | Servicio de mesas | Monitor de parque | Cocina |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `/monitor` sala | sí | sí | sí | — | sí | — |
| `/entrada` | sí | sí | sí | — | sí | — |
| `/salida` | sí | sí | sí | — | sí | — |
| `/caja` · `/ventas` | sí | sí | sí | — | **sí** | — |
| `/turno` | sí | sí | sí | — | — | — |
| `/mesas` | sí | sí | **sí** | sí | — | — |
| `/cocina` (KDS) | sí | sí | — | — | — | sí |
| Inventario | sí | sí | — | — | — | — |
| Reportes / Inicio | sí | sí | — | — | — | — |
| Usuarios | sí | — | — | — | — | — |
| Cámaras | sí | — | — | — | — | — |

Las dos celdas en negrita son deliberadas y conviene recordarlas: **la taquilla cobra** (emite
documento al liquidar una estancia, DEC-16) y **la caja puede tomar pedidos** en un local de dos
personas. No son errores; son la causa de los hallazgos N-01 y N-06.

Reparto de las 27 acciones:

| Rol | Directas | Con autorización | Denegadas |
|---|---:|---:|---:|
| Administración | 27 | 0 | 0 |
| Supervisión | 13 | 10 | 4 |
| Caja | 9 | 6 | 12 |
| Monitor de parque | 5 | 3 | 19 |
| Servicio de mesas | 4 | 1 | 22 |
| Cocina | 1 | 0 | 26 |

## 2. La jerarquía, tal como está construida

Hay **dos mundos** (DEC-13) y eso está bien:

```
(estacion)  pantalla completa, barra de 64 px, sin menú
            /acceso  /monitor  /entrada  /salida  /caja  /ventas  /turno  /mesas  /cocina
            navegación: pestañas DENTRO de un grupo (parque | caja | restaurante)

(admin)     barra lateral + migas
            /panel → /panel/[modulo] → /panel/[modulo]/[seccion]
            navegación: menú lateral, migas, tarjetas del módulo
```

Y **tres guardias**, todas del lado del cliente:

| Dónde | Qué pregunta | Archivo |
|---|---|---|
| `GuardiaEstacion` | `puedeAbrirRuta(actor, ruta)` — la acción de esa superficie | `shell/GuardiaEstacion.tsx` |
| `BackOfficeShell` | `puedeAbrirPanel(actor, ruta)` — Inicio, módulo o sección | `shell/BackOfficeShell.tsx:121` |
| `GuardiaAcceso` | los tres estados: sin hidratar, sin sesión, sin permiso | `identity/GuardiaAcceso.tsx` |

El punto débil no es que falten guardias: es que **el mapa de módulos cruza los dos mundos sin
decirlo**. Ocho de las diecinueve secciones del panel apuntan a rutas de estación.

## 3. Hallazgos

### ~~N-01~~ · La monitora de parque acaba en la caja — **resuelto el 2026-09-14**

`puestoDe()` calcula el puesto de una persona tomando **la primera superficie que alcanza** de una
lista que empieza por `caja` (`identity/visibilidad.ts`, `ORDEN_PUESTOS`). Como la taquilla cobra,
la monitora alcanza `caja`, y su puesto calculado es `/caja`.

**Reproducido:** entrar como Ana Rojas (monitora) y abrir `/turno`. La pantalla dice «Monitora de
parque no tiene acceso al turno de caja» y ofrece **«Ir a la caja»**, que no es su puesto.

Aparece en todo lo que use `puestoDe`: el rechazo de una pantalla y el bloqueo por inactividad.

**Propuesta:** el puesto de cada rol es un **dato explícito**, como ya lo es `PUESTO_DE_ROL` en
`identity/operador.ts`, y no el primero de una lista ordenada para otra cosa. Además une los dos
sitios donde hoy se dice lo mismo de dos maneras (ver N-02).

> **Hecho.** `puestoDe` lee un `PUESTO_DE_ROL` propio en `visibilidad.ts`. De paso quedó clara una
> distinción que el cálculo anterior confundía: **dónde se trabaja y qué se alcanza no son lo mismo**.
> Si la sucursal le abre el back-office a la caja (N-05), la cajera pasa a poder mirar los reportes,
> pero su sitio sigue siendo la caja y al entrar aparece cobrando. Comprobado: la monitora ve ahora
> «Ir a la sala del parque».

### ~~N-02~~ · Dos verdades sobre a dónde va cada rol — **resuelto el 2026-09-14**

`app/(estacion)/acceso/page.tsx` trae el destino **escrito a mano por persona** (`destino: "/monitor"`),
mientras `puestoDe()` lo **deriva**. Coinciden en cinco de seis roles y discrepan justo en la monitora,
que es como se descubrió N-01: por eso entrar funciona bien y el rechazo manda al sitio equivocado.

**Propuesta:** una sola fuente. El acceso deja de declarar destinos y pregunta `puestoDe(actorDe(o))`.

> **Hecho.** `Operador` ya no lleva `destino` ni `destinoNombre`, y la pantalla de acceso llama a
> `puestoDe`. Queda un solo sitio donde se decide a dónde entra cada quien.

### ~~N-03~~ · «Dispositivos» te saca de la sesión — **resuelto el 2026-09-14**

Panel → Personas → **Dispositivos** apunta a `/acceso` (`shell/navigation.ts`). `/acceso` es la
pantalla de bloqueo del equipo.

**Reproducido:** desde `/panel/personas`, pulsar «Dispositivos» lleva a `/acceso`, con el título
**«¿Quién entra?»** y **sin barra lateral**. Para la administradora, es indistinguible de que la
hayan echado de la sesión.

**Propuesta:** dejarla como sección pendiente con su tarea (F2-02, registro y aprobación de
dispositivos, ADR-013) hasta que la pantalla exista. Una pantalla honesta que dice qué falta es mejor
que un enlace que parece un cierre de sesión.

> **Hecho.** Ahora abre `/panel/personas/dispositivos`, dentro del back-office, y explica qué hará y
> qué falta antes.

### ~~N-04~~ · Se sale del back-office sin avisar — **resuelto el 2026-09-17**

Ocho secciones del panel abren rutas de estación: Monitor de sala, Entrada, Salida, Mesas y pedidos,
Comandas del día, Cobrar, Ventas del turno y Turnos y cortes. Al pulsarlas desaparecen la barra
lateral y las migas, y la pantalla pasa a ocupar todo. (Eran nueve: «Dispositivos» era la peor de
todas y se arregló en N-03.)

**Reproducido:** Panel → Parque → «Monitor de sala» abre `/monitor` con **cero migas y cero barra
lateral**.

Volver depende del rol: el botón «Panel» de la barra de estación solo se pinta para quien ve Inicio
—administración y supervisión— (`shell/StationBar.tsx`). Quien no, vuelve con el botón del navegador.

*Resuelto:* el mapa las marca con `abre: "estacion"` y lo dicen el menú (icono con su texto para
lectores de pantalla y en el `title`) y la tarjeta del módulo («Se abre a pantalla completa»). Lo de
volver lo resolvió N-05: con una sola puerta al panel, quien entra por una de esas secciones es
exactamente quien ve el botón «Panel» de la barra.

**Propuesta original:** marcar esas secciones en el mapa (`abre: "estacion"`) y decirlo en la tarjeta y en el
menú («se abre a pantalla completa»). Es un cambio de una línea en el tipo `Seccion` y resuelve la
sorpresa sin romper los dos mundos.

### ~~N-05~~ · Módulos del panel para quien no puede entrar al panel — **resuelto el 2026-09-14**

`/panel` exige `reportes.verSucursal` (solo administración y supervisión), pero `/panel/<modulo>`
exige solo la acción del módulo.

**Reproducido:**

| Rol | `/panel` | `/panel/caja` |
|---|---|---|
| Caja | «Cajera no tiene acceso al panel» | **se abre** |
| Monitor de parque | «Monitora de parque no tiene acceso al panel» | **se abre** |
| Servicio de mesas | sin acceso | sin acceso |
| Cocina | sin acceso | sin acceso |

La cajera queda dentro del back-office, con barra lateral, sin fila de Inicio y sin poder subir un
nivel: las migas la llevan a `/panel`, que le niega el paso.

**Propuesta:** decidirlo, no dejarlo al azar de dos reglas escritas por separado. Lo más simple y
coherente con DEC-13: **el panel es de administración y supervisión**, y `puedeAbrirPanel` exige
Inicio para cualquier ruta que empiece por `/panel`. Si en algún momento hay módulos para operación,
entonces Inicio tiene que ser alcanzable para esos roles.

> **Decidido y hecho el 2026-09-14**, con una vuelta de tuerca que pidió el cliente: **una sola
> puerta** —`reportes.verSucursal`— para todo `/panel*`, y **quién la cruza deja de estar clavado en
> el código**. Es un ajuste de la sucursal sobre la matriz, editable en Panel → Configuración →
> **Roles y accesos**, con motivo, autor y hora, y retirable (F2-13).
>
> El ajuste se lee **encima** de la matriz sin reescribirla, y lo decidido para una persona (DEC-15)
> gana sobre lo decidido para su rol. Hay un suelo que ninguna sucursal puede tocar, comprobado en el
> dominio: la fila de administración —un local que se quita a sí mismo la administración se queda sin
> nadie que pueda devolvérsela— y las dos llaves de la casa, `usuarios.gestionar` y
> `catalogo.modificar`, porque la primera permite concederse el resto y la segunda abre esa misma
> pantalla de ajustes.
>
> Comprobado de punta a punta: antes, la caja no entra por ninguna de las tres puertas; después de
> abrirla, la cajera entra al panel, **sigue aterrizando en la caja** al identificarse, y sigue sin
> poder abrir «Roles y accesos».

### ~~N-06~~ · El conmutador de estación encierra por grupo — **resuelto el 2026-09-17**

Las pestañas de la barra salen de tres grupos fijos (`PUESTOS` en `StationBar.tsx`): parque, caja y
restaurante. Solo se ven las del grupo de la pantalla actual. Consecuencia: la cajera **alcanza**
`/mesas` pero desde `/caja` no hay pestaña que lleve allí, y la monitora **alcanza** `/caja` pero
desde `/monitor` tampoco. Solo se llega escribiendo la dirección.

**Propuesta:** mantener las pestañas del grupo —son el conmutador del puesto, y está bien— y añadir
un paso explícito a las demás superficies alcanzables, agrupadas, en el menú de la barra. En un local
de dos personas, «la cajera también atiende mesas» es el caso normal, no la excepción.

*Resuelto* ([barra-puestos](encargos/barra-puestos.md)): al final de las pestañas, un botón «Otros
puestos» abre una hoja con las superficies de los demás puestos que el rol puede abrir, agrupadas.
Comprobado: la cajera llega al parque y a mesas; la monitora, a cobrar y ventas; mesero y cocina no
tienen otros puestos y no ven el botón.

### ~~N-07~~ · Las personas del acceso no son las del directorio — **resuelto el 2026-09-17**

El acceso usa ids `u0…u5` (`acceso/page.tsx`) y Usuarios y permisos usa `u-abigail`, `u-marisol`…
(`demo/usuarios.ts`). La sesión guarda `u0`; `UsuariosPage` asume que el actor es `u-abigail`.

Hoy solo ensucia la demostración, pero cuando exista auditoría **el mismo acto quedaría firmado por
dos identidades distintas**, y una baja en Usuarios no quitaría a nadie del acceso.

*Resuelto:* el acceso se alimenta del directorio filtrando `active`, con sus identificadores
(`u-abigail`…) y el nombre del rol del catálogo. «Usuarios y permisos» y «Roles y accesos» firman con la
persona en sesión en vez de con una constante; sin sesión no pintan nada, porque un asiento de auditoría
con identidad inventada es peor que una pantalla vacía. Comprobado: entrar como cajera enseña «Caja no
tiene acceso a Usuarios y permisos».

### ~~N-08~~ · El acceso no filtra a quien está de baja — **resuelto con N-07**

Carla Benítez está de baja en el directorio y no aparece en el acceso **por casualidad**: son dos
listas distintas. Con el directorio como fuente, sería por regla.

### ~~N-09~~ · Cocina «ve» el módulo Restaurante — **resuelto con N-05**

`puedeVerModulo` es cierto para Cocina en Restaurante, porque la sección «Comandas del día» pide
`kds.cambiarEstado`. No llega a notarse porque Cocina no puede abrir el panel, pero es una promesa
que el código hace y el producto no cumple. Se resolvió sola con N-05: con una sola puerta, Cocina no llega al panel por ninguna vía.

### ~~N-10~~ · `/ventas` comparte superficie con `/caja` — **decidido el 2026-09-17 (DEC-25)**

`SUPERFICIE_DE_RUTA` mapea `/ventas` a la superficie `caja` (C12: quien cobra ve lo que cobró). Como
la taquilla también cobra, **la monitora ve las ventas del turno completas**, incluidas las del otro
punto de cobro. Puede ser exactamente lo que se quiere en un local de dos personas; conviene que sea
una decisión escrita y no un efecto lateral.

*Decidido:* **solo la caja cobra** (DEC-25). La monitora ya no alcanza la caja, así que Ventas la ven
quienes operan la caja —cajera, supervisión y administración—, con todo lo cobrado del turno.

## 4. Lo que está bien y no hay que tocar

Para que la lista de arriba no se lea como que la navegación está rota:

- **Una sola fuente para el menú, la página del módulo y las migas** (`navigation.ts`). Añadir una
  sección es tocar un archivo, no seis.
- **Las secciones declaran su acción, no una lista de roles.** Añadir un rol no obliga a revisar
  catorce sitios.
- **La dirección no es una puerta**: escribir la URL de una estación ajena no la abre; se explica de
  quién es la sesión y se ofrece salida.
- **La guardia no destella la pantalla prohibida** mientras hidrata: pinta un hueco, no el contenido.
- **Las secciones sin construir explican qué harán, con qué tarea y qué falta antes**, en vez de ser
  enlaces muertos.
- **Cocina tiene exactamente una acción.** Un KDS con más permisos de los necesarios es un KDS que
  alguien usará para otra cosa.

## 5. Orden propuesto

| # | Hallazgo | Coste | Cuándo |
|---|---|---|---|
| ~~1~~ | ~~N-03 Dispositivos → `/acceso`~~ | — | **hecho el 2026-09-14** |
| ~~2~~ | ~~N-01 + N-02 el puesto de cada rol, una sola fuente~~ | — | **hecho el 2026-09-14** |
| ~~3~~ | ~~N-05 quién entra al panel~~ | — | **hecho el 2026-09-14**, y editable (F2-13) |
| 4 | N-04 avisar de que una sección abre a pantalla completa | pequeño | ya |
| 5 | N-06 llegar a las demás superficies alcanzables | medio | con el rediseño de la barra |
| 6 | N-07 + N-08 el acceso sale del directorio | medio | ya, o con F2-03 en servidor |
| 7 | N-10 alcance de «Ventas del turno» | — | decisión del cliente |
| 8 | Las tres guardias, en el servidor | grande | **F2-05, backend** |

Lo que no está en esta tabla y es lo más importante: **nada de esto es seguridad hasta que el
servidor repita la matriz**. Mientras tanto, lo que se arregla aquí es que el producto no mande a
nadie al sitio equivocado.
