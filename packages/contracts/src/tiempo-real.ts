/**
 * El tiempo real — B5-1, ADR-008 y ADR-025.
 *
 * Lo que viaja del worker a las pantallas NO son datos: son **temas** que cambiaron. Cada pantalla
 * vuelve a leer lo suyo con su sesión y sus permisos, por el mismo camino de siempre. Así el canal
 * no puede filtrar nada que la persona no pueda leer, y un evento repetido o perdido solo cuesta
 * una lectura de más o de menos (al reconectar se vuelve a leer todo).
 *
 * La excepción es el bus de la operación del restaurante (`OperationEventSchema`), provisional hasta
 * la Etapa 6: sus eventos viajan tal cual entre los equipos de una sucursal, revalidados en el worker.
 */
import { z } from "zod";
import { OperationEventSchema } from "./eventos.ts";

/** De qué habla un cambio. Uno por cada lectura que una pantalla sabe repetir. */
export const TemaSchema = z.enum([
  /** Los niños en sala (B4). */
  "sala",
  /** Las cuentas y su cola de caja (B3-3). */
  "cuentas",
  /** Las ventas del turno (B3-4). */
  "ventas",
  /** Los turnos, sus cortes y los pendientes del cierre (B3-1, B3-5). */
  "turno",
  /** Las tasas de cambio y los feriados que deciden cuál rige (B2-1, B2-4). */
  "tasas",
  /** Las alícuotas con su vigencia (B2-2). */
  "impuestos",
  /** El tarifario del parque (B0-5). */
  "tarifario",
  /** Los medios de pago y sus terminales (B3-2). */
  "medios",
  /** El catálogo de productos, sus precios (B9-1) y su existencia (B9-2). */
  "catalogo",
  /** Los equipos: solicitudes, aprobaciones y revocaciones (B1-3, M-7). */
  "equipos",
  /** Las personas, sus roles y permisos (B1-5). */
  "personal",
  /** Quién está en sesión y en qué puesto (F9-08, D7). */
  "sesiones",
  /** Los ajustes de la sucursal: formato de hora, zona, umbrales (B4-4). */
  "sucursal",
  /** Las reglas de descuento y las familias VIP (B3-6). */
  "descuentos",
  /** Las impresoras, sus agentes y la cola de impresión (B5-2). */
  "impresion",
  /** El plano del local: sus mesas y su estructura (B6-1). */
  "plano",
]);
export type Tema = z.infer<typeof TemaSchema>;

/** Lo que el worker cuenta a una sucursal: qué temas cambiaron. */
export const CambioSchema = z.object({
  temas: z.array(TemaSchema).min(1),
});
export type CambioDto = z.infer<typeof CambioSchema>;

/**
 * El ticket con el que un navegador abre el canal. Lo firma el servidor web para quien tiene
 * sesión y vale unos segundos: basta para el apretón de manos (ADR-008: la autorización ocurre
 * ahí, no después).
 */
export const TicketTiempoRealSchema = z.object({
  ticket: z.string().min(20).max(1000),
  /** A dónde conectarse. Vacío = la misma máquina que sirve la página, en `puerto`. */
  url: z.string().max(300),
  puerto: z.number().int().min(1).max(65535),
});
export type TicketTiempoRealDto = z.infer<typeof TicketTiempoRealSchema>;

/**
 * Los eventos del bus que un navegador puede mandar: solo los del restaurante, que todavía no
 * tiene servidor (Etapa 6). Lo que el servidor ya sabe (la sala, quién está en sesión, la
 * impresora) no lo declara un navegador.
 */
export const TIPOS_DEL_NAVEGADOR = /^(mesa|pedido)\./;

/** Un evento del bus tal como lo manda un navegador: sin el instante, que lo pone el worker. */
export const EventoDelNavegadorSchema = OperationEventSchema.refine((e) => TIPOS_DEL_NAVEGADOR.test(e.type), {
  message: "Ese evento no lo manda una pantalla",
});
