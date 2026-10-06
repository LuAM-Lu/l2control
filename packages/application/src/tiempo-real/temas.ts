/**
 * Qué cambia en las pantallas cuando ocurre cada cosa — B5-1, ADR-025.
 *
 * Cada asiento HECHO de la auditoría deja su fila en el outbox (lo hace la base, en la misma
 * transacción). Aquí se traduce su acción a los temas que las pantallas deben volver a leer. La
 * tabla cubre TODO el catálogo de `AccionAuditada`: una acción nueva no compila hasta que alguien
 * decide qué invalida, aunque sea nada.
 */
import type { Tema } from "@l2/contracts";
import type { AccionAuditada } from "../auditoria/auditar.ts";

const NADA: readonly Tema[] = [];
/** Un cobro mueve la cuenta, la venta que deja y lo cobrado del turno. */
const DINERO: readonly Tema[] = ["cuentas", "ventas", "turno"];
/** La entrada y la salida del parque abren y actualizan la cuenta de la familia. */
const PARQUE: readonly Tema[] = ["sala", "cuentas"];

export const TEMAS_DE_ACCION: Readonly<Record<AccionAuditada, readonly Tema[]>> = {
  "tarifario.publicar": ["tarifario"],
  // El formato de hora, la zona y los umbrales los lee toda pantalla (B4-4). La zona decide además
  // qué tasa y qué precio rigen hoy.
  "sucursal.ajustar": ["sucursal", "tasas", "impuestos", "catalogo", "sala"],

  "tasa.capturar": ["tasas"],
  "tasa.confirmar": ["tasas"],
  "tasa.aplicar": ["tasas"],
  // La consulta al BCV deja su asiento aunque no traiga nada; lo que sí trae lo aplica
  // `tasa.aplicar` o queda pendiente, y las dos cosas cambian el historial.
  "tasa.sincronizar": ["tasas"],
  // Un feriado cambia qué tasa rige ese día (B2-4).
  "feriado.registrar": ["tasas"],
  "feriado.retirar": ["tasas"],
  "impuesto.programar": ["impuestos"],

  "pago.asentar": DINERO,
  "pago.revertir": DINERO,
  "cuenta.abrir": ["cuentas"],
  "cuenta.guardar": ["cuentas"],
  "cuenta.cobrar": DINERO,
  "cuenta.anular_cobro": DINERO,
  "cuenta.cortesia": ["cuentas", "ventas"],
  "cuenta.quitar_cortesia": ["cuentas", "ventas"],
  // Una incobrable sale de los pendientes del cierre.
  "cuenta.incobrable": ["cuentas", "turno"],
  // Poner o quitar un descuento cambia lo que se cobra de esa cuenta (B3-6).
  "cuenta.descuento": ["cuentas"],
  "cuenta.quitar_descuento": ["cuentas"],
  // Una regla nueva o retirada cambia lo que la caja ofrece; marcar una familia VIP, también, y el directorio.
  "descuento.crear": ["descuentos"],
  "descuento.retirar": ["descuentos"],
  "familia.vip": ["descuentos", "sala"],
  // La cola de impresión y sus impresoras (B5-2): el worker avisa además a los agentes de la sucursal.
  "impresion.encolar": ["impresion"],
  "impresion.confirmar": ["impresion"],
  "impresion.fallar": ["impresion"],
  "impresion.reintentar": ["impresion"],
  "impresion.descartar": ["impresion"],
  "producto.carta": ["catalogo"],
  "plano.publicar": ["plano"],
  // El pedido cambia la cuenta de la mesa; su comanda en la cola avisa con su propio asiento (impresion).
  "pedido.enviar": ["pedidos", "cuentas"],
  "pedido.reimprimir": ["pedidos"],
  // Anular un plato ya enviado cambia la cuenta de la mesa, no su comanda (ya se imprimió, B6-3).
  "pedido.anular": ["cuentas"],
  "mesa.liberar": ["cuentas"],
  // Vincular pulseras mueve dinero entre la cuenta de la mesa y la de cada familia tocada (F6-05).
  "mesa.vincular": ["cuentas", "sala"],
  // Los cumpleaños (B10-1): reservar abre la cuenta del anticipo en la cola de la caja; cancelar la
  // cierra sin consumo y la saca de los pendientes del cierre.
  "evento.catalogo": ["eventos"],
  "evento.reservar": ["eventos", "cuentas"],
  "evento.cancelar": ["eventos", "cuentas", "turno"],
  // Empezar el día abre la cuenta del día en la caja y saca lo incluido del estante (B10-2).
  "evento.empezar": ["eventos", "cuentas", "catalogo", "turno"],
  // Los invitados entran a la sala y a la cuenta del día.
  "evento.entrada": ["eventos", "sala", "cuentas"],
  "impresora.crear": ["impresion"],
  "impresora.editar": ["impresion"],
  "impresora.activar": ["impresion"],
  "impresora.retirar": ["impresion"],
  "agente.codigo": ["impresion"],
  "agente.vincular": ["impresion"],
  "agente.retirar": ["impresion"],
  "venta.imprimir": ["ventas"],
  "venta.reimprimir": ["ventas"],

  "turno.abrir": ["turno"],
  "turno.arqueo": ["turno"],
  "turno.corte_x": ["turno"],
  // El Z cierra el turno: la caja deja de cobrar en ese equipo y los pendientes cambian.
  "turno.corte_z": ["turno", "cuentas"],
  // La carga desde papel (B3-7): abrirla, terminarla y revisarla cambian lo que dice su pantalla y los pendientes del cierre.
  "papel.abrir": ["papel", "turno"],
  "papel.cerrar": ["papel", "turno"],
  "papel.revisar": ["papel", "turno"],

  "parque.entrada": PARQUE,
  "parque.salida": PARQUE,
  "parque.nombrar": ["sala"],
  "parque.recarga": PARQUE,
  "parque.cierre_administrativo": PARQUE,
  "representante.corregir": PARQUE,
  "nino.corregir": ["sala"],

  "medio.crear": ["medios"],
  "medio.encender": ["medios"],
  "medio.apagar": ["medios"],
  "medio.datos": ["medios"],
  "terminal.crear": ["medios"],
  "terminal.retirar": ["medios"],

  "producto.crear": ["catalogo"],
  "producto.editar": ["catalogo"],
  "producto.activar": ["catalogo"],
  "producto.apartar": ["catalogo"],
  "precio.programar": ["catalogo"],
  "producto.minimo": ["catalogo"],
  // La existencia viaja con el catálogo: la caja y la tablet dejan de ofrecer lo que se acabó (B9-2).
  "existencia.mover": ["catalogo"],
  // Una entrada sube la existencia y mueve el costo promedio: la caja vuelve a ofrecer lo que llegó.
  "inventario.entrada": ["catalogo"],
  // Una salida o un conteo cambian la existencia y el costo: la caja deja de ofrecer lo que ya no hay.
  "inventario.salida": ["catalogo"],
  "inventario.conteo": ["catalogo"],

  "sesion.abrir": ["sesiones"],
  "sesion.cerrar": ["sesiones"],
  // Un PIN fallido, un bloqueo o una elevación no cambian lo que enseña ninguna pantalla ajena.
  "sesion.pin_fallido": NADA,
  "sesion.bloqueada": NADA,
  "sesion.elevar": NADA,
  "sesion.elevar_fallido": NADA,

  "dispositivo.solicitar": ["equipos"],
  "dispositivo.aprobar": ["equipos"],
  // Revocar un equipo cierra sus sesiones en el acto (B1-3).
  "dispositivo.revocar": ["equipos", "sesiones"],
  "dispositivo.renombrar": ["equipos", "sesiones"],

  "usuario.alta": ["personal"],
  // La baja cierra sus sesiones.
  "usuario.baja": ["personal", "sesiones"],
  "usuario.reingreso": ["personal"],
  "usuario.rol": ["personal", "sesiones"],
  "usuario.pin": ["personal"],
  "usuario.contrasena": ["personal"],
  "usuario.llave": ["personal"],
  "usuario.enlace": ["personal"],
  "usuario.codigo_recuperacion": ["personal"],
  // El local nace con su primera persona y su primer equipo: quien ya mire, vuelve a leer los dos.
  "instalacion.completar": ["personal", "equipos"],
  "permiso.conceder": ["personal"],
  "permiso.revocar": ["personal"],
  "permiso.retirar": ["personal"],
  "acceso.ajustar": ["personal"],
  "acceso.retirar": ["personal"],

  // Una autorización acompaña a otra operación, que es la que cuenta el cambio.
  "autorizacion.conceder": NADA,
  "autorizacion.negar": NADA,
};

const esAccion = (a: string): a is AccionAuditada => Object.hasOwn(TEMAS_DE_ACCION, a);

/** Los temas que invalida una acción. Una que no está en el catálogo no invalida nada. */
export function temasDe(accion: string): readonly Tema[] {
  return esAccion(accion) ? TEMAS_DE_ACCION[accion] : NADA;
}
