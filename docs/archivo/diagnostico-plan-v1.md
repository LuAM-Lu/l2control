# Diagnóstico del plan v1

> **Archivado el 2026-09-11.** Era el §1 de [PLAN.md](../PLAN.md). Explica qué se conservó del
> plan original ([SPEC-v1.md](SPEC-v1.md)) y por qué se reescribió. Es historia: no especifica
> nada que haya que construir.

### 1.1 Lo que el plan v1 acertó

El plan original **no se reescribe por estar mal**. Su lectura del negocio es correcta y poco
común, y esto se conserva íntegro:

- **La tesis del producto es la correcta.** Unificar la cuenta del parque con la del restaurante
  es el verdadero diferencial: el representante paga una sola vez y el negocio captura el consumo
  cruzado. Casi ningún POS genérico hace esto.
- **Trata el hardware como ciudadano de primera clase.** Escáner HID con buffer global e impresión
  ESC/POS por socket TCP 9100 son las decisiones correctas, no atajos.
- **La paleta y el modo oscuro.** Slate oscuro con semáforo verde/ámbar/rojo es lo correcto para
  turnos largos y para leer estado a distancia. Se conserva y se formaliza (§8).
- **Modalidad dual prepago/postpago.** Refleja cómo opera un parque real, no un modelo de libro.
- **Separación de superficies** (POS / KDS / Monitor de parque / Admin) como rutas con layouts
  propios: es la partición correcta y se profundiza en §9.
- **El formato de documento ejecutable con casillas.** Se conserva y se refuerza con identificadores
  y criterios de aceptación.

### 1.2 Hallazgos — qué falta o qué rompería en producción

| # | Sev. | Hallazgo | Consecuencia si se ignora | Se resuelve en |
|---|---|---|---|---|
| H-01 | 🔴 | **Cero cumplimiento fiscal venezolano.** No menciona SENIAT, máquina fiscal, imprenta digital autorizada, número de control ni homologación. | El sistema emite papeles sin valor legal. Sanción para el negocio y software inservible para su fin. | §5.4 · F7 |
| H-02 | 🔴 | **No existe modelo de impuestos.** Ni IVA ni IGTF aparecen, pese a que el plan sí lista pagos en divisas y cripto — que es exactamente lo que dispara el IGTF del 3 %. | Toda factura sale con el monto equivocado. Corregirlo después obliga a reprocesar el histórico. | §5.3 |
| H-03 | 🔴 | **El dinero no tiene representación definida.** Dice «multimoneda» pero nunca cómo se almacena un monto. | Si alguien usa `Float`, el sistema pierde centavos de forma silenciosa e irreparable. | §5.1 · ADR-004 |
| H-04 | 🔴 | **La tasa de cambio no se congela.** Se trata como configuración global («actualización manual o BCV»), no como dato de la transacción. | El reporte de ventas de ayer cambia hoy al cambiar la tasa. La caja nunca cuadra. Es el error más común y más caro del software venezolano. | §5.2 · ADR-005 |
| H-05 | 🔴 | **Sin plan de operación offline.** Define despliegue «en la nube» y nada más, en un entorno con cortes recurrentes de energía e internet. | Sin internet el negocio no puede facturar ni dejar salir a los niños. El sistema pasa de activo a pasivo. | ADR-003 · F1 |
| H-06 | 🔴 | **Auditoría llegando en Fase 5.** El log de auditoría queda al final, junto con los reportes. | Todo lo construido en las fases 1-4 (caja, cobros, anulaciones) queda sin rastro. Y el fraude interno es la amenaza n.º 1 de un POS. | §7.4 · F2 |
| H-07 | 🟠 | **RBAC declarado pero no especificado.** Cinco roles listados, sin matriz de permisos, sin verificación de pertenencia a sucursal y sin *deny-by-default*. | Un cajero de una sucursal anula tickets de otra. Escalada trivial. | §7.3 |
| H-08 | 🟠 | **Multi-tenencia indefinida.** Se llama «SaaS» y tiene `Branch`, pero nunca decide si sirve a varios clientes. | Si entra un segundo cliente hay que rehacer el modelo de datos y migrar todo. | ADR-002 · DEC-3 |
| H-09 | 🟠 | **Descarga de inventario ambigua.** Dice «al facturar **o** al preparar», sin decidir. | Doble descuento o ningún descuento. El inventario deja de servir en semanas. | §6.5 · ADR-012 |
| H-10 | 🟠 | **Sin estrategia de pruebas.** No se menciona testing en ninguna de las 7 fases. | En un sistema que maneja dinero e impuestos es inaceptable: cada cambio es una apuesta. | §10.1 |
| H-11 | 🟠 | **Sin CI/CD, entornos, respaldos ni recuperación.** No hay dev/staging/prod, ni RPO/RTO. | Un disco dañado borra el histórico fiscal y no hay forma de revertir un despliegue malo. | §10.3 · §10.4 |
| H-12 | 🟠 | **Sin observabilidad.** Nada detecta «la comanda no llegó a cocina». | Los fallos los descubre el cliente enojado, no el equipo. | §10.2 |
| H-13 | 🟠 | **Datos de menores sin tratamiento.** Registra nombres de niños y teléfonos de representantes sin minimización, consentimiento ni retención. | Riesgo legal y reputacional desproporcionado al beneficio. | §7.6 |
| H-14 | 🟠 | **Sin propinas ni servicio.** Un restaurante sin manejo del 10 % de servicio y su reparto no es usable. | Módulo entero faltante, descubierto en producción. | F6 |
| H-15 | 🟠 | **Sin arquitectura modular explícita.** El árbol de carpetas de v1 agrupa por *capa técnica* (`components/`, `lib/`), no por dominio, y nada impide que el POS importe internals del inventario. | A los pocos meses todo depende de todo: cambiar el precio de un plato rompe el KDS. | §9 |
| H-16 | 🟡 | **Versiones del stack desactualizadas.** Fija Next.js 14 y no fija Node, Prisma ni NestJS. | Se arranca con dos versiones mayores de atraso el día uno. | §4 |
| H-17 | 🟡 | **Sin `businessDate`.** No distingue día calendario de día de negocio. | El corte Z de las 2 a.m. parte las ventas en dos días y los reportes mienten. | ADR-009 |
| H-18 | 🟡 | **Cronómetro sin fuente de verdad.** No define si el tiempo lo calcula el cliente o el servidor. | El reloj mal configurado de una tablet regala o cobra tiempo de más. | ADR-010 |
| H-19 | 🟡 | **Sesiones de parque sin cierre forzado.** Nada define qué pasa si un niño se va sin check-out. | Sesiones abiertas acumulando cargos infinitos y ocupando el tablero. | F5 |
| H-20 | 🟡 | **EZVIZ Cloud SDK como pasarela de video.** Dependencia de una nube de terceros para ver cámaras que están en la misma LAN. | Latencia, *lock-in*, y cámaras que dejan de verse cuando cae internet. | ADR-014 |
| H-21 | 🟡 | **Sin rollout, migración de datos ni capacitación.** El plan termina en «software listo», no en «negocio operando». | El proyecto se entrega y no se usa. | F12 |

### 1.3 Cambios estructurales respecto a v1

1. **Se antepone una Fase 0 de descubrimiento y cumplimiento.** Antes de escribir código hay que
   responder preguntas de las que depende el modelo de datos (fiscalidad, tenencia, offline).
2. **El «Núcleo Monetario y Fiscal» pasa a ser su propia fase temprana (F3).** En v1 el dinero
   estaba repartido entre caja y facturación, lo que obliga a rehacerlo. Monedas, tasas, impuestos
   y ledger se construyen **una sola vez y antes** de que algo cobre.
3. **Auditoría y RBAC suben a F2**, antes de cualquier operación con dinero.
4. **Se separa «Facturación» de «Comandas».** En v1 iban juntas; son dominios distintos con reglas
   legales distintas y ciclos de vida distintos.
5. **Se añade §9, arquitectura modular y estándares**, que en v1 no existía: fronteras entre
   módulos, biblioteca de componentes reutilizables y reglas que impiden la duplicación.
6. **Se añaden fases de endurecimiento (F11) y de puesta en marcha real (F12).**
7. **Cada tarea gana un criterio de aceptación verificable.**
