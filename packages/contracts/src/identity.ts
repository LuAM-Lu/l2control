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

export const UserSummarySchema = z
  .object({
    id: IdSchema,
    fullName: z.string().trim().min(2).max(80),
    role: RoleSchema,
    branchIds: z.array(IdSchema).min(1, "Toda persona pertenece al menos a una sucursal"),
    active: z.boolean(),
    exceptions: z.array(PermissionExceptionSchema),
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
