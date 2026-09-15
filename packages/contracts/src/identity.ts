/**
 * Contratos de identidad: personas, roles y excepciones de permiso.
 *
 * F2-11, DEC-15, §9.10.6. El rol es la base y la excepción es un DATO
 * auditable: quién la concedió, cuándo y por qué.
 *
 * Los nombres de rol y de permiso se declaran aquí como enumeraciones propias
 * y no se importan del dominio: este paquete es la hoja del grafo. El
 * traductor de `features/identity` es quien comprueba que coinciden —si el
 * dominio añade un rol y el contrato no, deja de compilar allí—.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives.ts";

export const RoleSchema = z.enum([
  "ADMIN",
  "SUPERVISOR",
  "CAJERO",
  "MESERO",
  "MONITOR_PARQUE",
  "COCINA",
]);
export type RoleDto = z.infer<typeof RoleSchema>;

export const PermissionSchema = z.enum(["PERMITIDO", "REQUIERE_AUTORIZACION", "DENEGADO"]);
export type PermissionDto = z.infer<typeof PermissionSchema>;

/**
 * Nombre de una acción, como `tasa.confirmar`.
 *
 * Aquí solo se comprueba la forma. Que la acción EXISTA lo comprueba la capa
 * que conoce la matriz: un contrato que listara las 26 acciones sería una
 * segunda copia de la matriz esperando a desincronizarse.
 */
const ActionNameSchema = z
  .string()
  .regex(/^[a-z]+\.[A-Za-z]+$/, "Elige una acción");

/**
 * El motivo es obligatorio y con contenido. §7.4 exige saber por qué cambió un
 * permiso, y un «ok» o un «x» en ese campo es no saberlo.
 */
const ReasonSchema = z
  .string()
  .trim()
  .min(10, "Explica el motivo en al menos 10 caracteres")
  .max(280, "El motivo no puede pasar de 280 caracteres");

/** Nivel que puede dar una concesión. Conceder «DENEGADO» sería una revocación. */
const GrantLevelSchema = z.enum(["PERMITIDO", "REQUIERE_AUTORIZACION"]);

/** Quién, cuándo y por qué. Lo pone el servidor, nunca el cliente. */
const auditoria = {
  grantedBy: IdSchema,
  grantedByName: z.string().trim().min(2).max(80),
  reason: ReasonSchema,
  at: TimestampSchema,
};

/**
 * Una excepción sobre el rol, ya registrada.
 *
 * **No lleva sucursal, y el esquema la rechaza si la trae** (`strictObject`).
 * Es la regla 2 de §9.10.6 hecha forma: una excepción que no puede nombrar
 * una sucursal no puede ampliarla. Vale donde ya opera la persona.
 */
export const PermissionExceptionSchema = z.discriminatedUnion("effect", [
  z.strictObject({
    effect: z.literal("GRANT"),
    action: ActionNameSchema,
    permission: GrantLevelSchema,
    ...auditoria,
  }),
  z.strictObject({
    effect: z.literal("REVOKE"),
    action: ActionNameSchema,
    ...auditoria,
  }),
]);
export type PermissionExceptionDto = z.infer<typeof PermissionExceptionSchema>;

/** Quién, cuándo y por qué, para lo que le pasa a una persona. */
const rastro = {
  by: IdSchema,
  byName: z.string().trim().min(2).max(80),
  reason: ReasonSchema,
  at: TimestampSchema,
};

/**
 * Lo que le ha pasado a una persona: alta, baja, reingreso, cambio de rol o
 * PIN repuesto.
 *
 * **Nada se borra** (regla 5 del repositorio): dar de baja no quita a nadie del
 * directorio, añade un asiento. Un cambio de rol guarda de dónde venía, porque
 * «¿quién podía cobrar en agosto?» es una pregunta que se hace después de que
 * pase algo, no antes.
 */
export const UserChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ALTA"), role: RoleSchema, ...rastro }),
  z.strictObject({ kind: z.literal("BAJA"), ...rastro }),
  z.strictObject({ kind: z.literal("REINGRESO"), ...rastro }),
  z.strictObject({ kind: z.literal("ROL"), from: RoleSchema, to: RoleSchema, ...rastro }),
  z.strictObject({ kind: z.literal("PIN"), ...rastro }),
]);
export type UserChangeDto = z.infer<typeof UserChangeSchema>;

/**
 * Un ajuste de la sucursal sobre un ROL entero — N-05 de la auditoría.
 *
 * La matriz de §7.3 es la base sensata, no un dogma. Un local decide que su
 * caja también ve los reportes, o que la taquilla no reimprime: eso no debería
 * exigir un despliegue ni repetirse persona por persona.
 *
 * No reescribe la matriz: se lee **encima** de ella, con su motivo y su autor,
 * y se puede retirar. Y no llega a todas las celdas: el dominio decide cuáles
 * son intocables (`esAjustable`), porque hay dos permisos que, regalados, harían
 * que este mismo ajuste fuera el último que alguien necesita hacer.
 */
export const RoleAdjustmentSchema = z.strictObject({
  role: RoleSchema,
  action: ActionNameSchema,
  /** El nivel que pasa a dar el rol. `DENEGADO` le quita lo que la matriz daba. */
  permission: PermissionSchema,
  ...rastro,
});
export type RoleAdjustmentDto = z.infer<typeof RoleAdjustmentSchema>;

/** Los accesos de una sucursal: su matriz de §7.3 más lo que haya ajustado. */
export const BranchAccessSchema = z
  .object({
    branchId: IdSchema,
    adjustments: z.array(RoleAdjustmentSchema).default([]),
  })
  .refine(
    (a) =>
      new Set(a.adjustments.map((x) => `${x.role}|${x.action}`)).size === a.adjustments.length,
    {
      // Dos ajustes sobre la misma celda no dicen cuál quiso decir quien los puso.
      message: "Un rol no puede tener dos ajustes sobre la misma acción",
      path: ["adjustments"],
    },
  );
export type BranchAccessDto = z.infer<typeof BranchAccessSchema>;

/**
 * Pedir un ajuste de rol, o retirarlo.
 *
 * Sin autor ni hora, como los demás comandos: los pone el servidor. Retirar
 * tampoco borra nada —el asiento de auditoría es del servidor—, solo deja de
 * leerse encima de la matriz.
 */
export const RoleAdjustmentCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("AJUSTAR"),
    branchId: IdSchema,
    role: RoleSchema,
    action: ActionNameSchema,
    permission: PermissionSchema,
    reason: ReasonSchema,
  }),
  z.strictObject({
    kind: z.literal("RETIRAR"),
    branchId: IdSchema,
    role: RoleSchema,
    action: ActionNameSchema,
    reason: ReasonSchema,
  }),
]);
export type RoleAdjustmentCommand = z.infer<typeof RoleAdjustmentCommandSchema>;

export const UserSummarySchema = z
  .object({
    id: IdSchema,
    fullName: z.string().trim().min(2).max(80),
    role: RoleSchema,
    branchIds: z.array(IdSchema).min(1, "Toda persona pertenece al menos a una sucursal"),
    active: z.boolean(),
    exceptions: z.array(PermissionExceptionSchema),
    /** Su historia, de lo más reciente a lo más antiguo. Vacía es «nunca cambió». */
    changes: z.array(UserChangeSchema).default([]),
  })
  .refine(
    (u) => new Set(u.exceptions.map((e) => e.action)).size === u.exceptions.length,
    {
      // Dos excepciones sobre la misma acción —o una concesión y una
      // revocación a la vez— no dicen qué quiso decir quien las puso.
      message: "Una persona no puede tener dos excepciones sobre la misma acción",
      path: ["exceptions"],
    },
  );
export type UserSummaryDto = z.infer<typeof UserSummarySchema>;

export const UsersDirectorySchema = z.object({ users: z.array(UserSummarySchema) });
export type UsersDirectoryDto = z.infer<typeof UsersDirectorySchema>;

/**
 * Pedir una concesión o una revocación.
 *
 * Sin `grantedBy` ni `at`, y el esquema los rechaza si vienen: quién está
 * autenticado y qué hora es lo sabe el servidor. Un cliente que pudiera
 * declarar su propio autor podría atribuirle el cambio a otra persona.
 */
/**
 * Pedir un cambio sobre una persona.
 *
 * Sin autor y sin hora, como el comando de excepción y por lo mismo: quién
 * está autenticado y qué hora es lo sabe el servidor. El motivo es obligatorio
 * en los cinco casos —incluido reponer un PIN— porque «¿por qué se le repuso el
 * PIN a la cajera el día del descuadre?» es exactamente la pregunta que alguien
 * hará (§7.4).
 *
 * Quién PUEDE hacerlo no se decide aquí: es `revisarCambio` de
 * `@l2/domain-identity`, que conoce la matriz y el estado del equipo.
 */
export const UserCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("ALTA"),
    fullName: z.string().trim().min(2, "El nombre completo, al menos dos caracteres").max(80),
    role: RoleSchema,
    branchIds: z.array(IdSchema).min(1, "Toda persona pertenece al menos a una sucursal"),
    reason: ReasonSchema,
  }),
  z.strictObject({ kind: z.literal("BAJA"), userId: IdSchema, reason: ReasonSchema }),
  z.strictObject({ kind: z.literal("REINGRESO"), userId: IdSchema, reason: ReasonSchema }),
  z.strictObject({ kind: z.literal("ROL"), userId: IdSchema, role: RoleSchema, reason: ReasonSchema }),
  z.strictObject({ kind: z.literal("PIN"), userId: IdSchema, reason: ReasonSchema }),
]);
export type UserCommand = z.infer<typeof UserCommandSchema>;

export const PermissionExceptionCommandSchema = z.discriminatedUnion("effect", [
  z.strictObject({
    effect: z.literal("GRANT"),
    userId: IdSchema,
    action: ActionNameSchema,
    permission: GrantLevelSchema,
    reason: ReasonSchema,
  }),
  z.strictObject({
    effect: z.literal("REVOKE"),
    userId: IdSchema,
    action: ActionNameSchema,
    reason: ReasonSchema,
  }),
]);
export type PermissionExceptionCommand = z.infer<typeof PermissionExceptionCommandSchema>;
