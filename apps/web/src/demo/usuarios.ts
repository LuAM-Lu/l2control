/**
 * Personas de ejemplo para la pantalla de usuarios (F2-11).
 *
 * Se validan contra el contrato AL CONSTRUIRSE, igual que el resto de datos
 * de ejemplo (§11.4): si alguien les da una forma que ningún contrato
 * declara, la aplicación falla al arrancar en lugar de dibujar algo que el
 * backend nunca devolverá.
 *
 * Dos excepciones reales de las que habló el cliente: la cajera que abre los
 * sábados y confirma la tasa, y el inventario reservado a la administración.
 *
 * Y una historia: Carla entró en marzo y se fue en agosto. **No se borra**
 * (regla 5): queda de baja, con su motivo y quién lo hizo, porque los cobros
 * que hizo mientras trabajaba siguen apuntando a ella.
 */
import { UsersDirectorySchema } from "@l2/contracts";

export const DEMO_USUARIOS = UsersDirectorySchema.parse({
  users: [
    {
      id: "u-abigail",
      fullName: "Abigail Karam",
      role: "ADMIN",
      branchIds: ["b1"],
      active: true,
      exceptions: [],
    },
    {
      id: "u-luis",
      fullName: "Luis Guerrero",
      role: "SUPERVISOR",
      branchIds: ["b1"],
      active: true,
      exceptions: [
        {
          effect: "REVOKE",
          action: "inventario.ajustar",
          grantedBy: "u-abigail",
          grantedByName: "Abigail Karam",
          reason: "El inventario lo lleva solo la administración mientras se ordena el depósito.",
          at: "2026-09-02T15:10:00.000Z",
        },
      ],
    },
    {
      id: "u-marisol",
      fullName: "Marisol Prieto",
      role: "CAJERO",
      branchIds: ["b1"],
      active: true,
      changes: [
        {
          kind: "PIN",
          by: "u-abigail",
          byName: "Abigail Karam",
          reason: "Olvidó el PIN después de las vacaciones y no podía abrir la caja.",
          at: "2026-09-08T11:40:00.000Z",
        },
      ],
      exceptions: [
        {
          effect: "GRANT",
          action: "tasa.confirmar",
          permission: "PERMITIDO",
          grantedBy: "u-abigail",
          grantedByName: "Abigail Karam",
          reason:
            "Abre el local los sábados antes de que llegue la supervisión y tiene que dejar la tasa confirmada.",
          at: "2026-09-05T12:30:00.000Z",
        },
      ],
    },
    {
      id: "u-ana",
      fullName: "Ana Rojas",
      role: "MONITOR_PARQUE",
      branchIds: ["b1"],
      active: true,
      exceptions: [],
    },
    {
      id: "u-jesus",
      fullName: "Jesús Mendoza",
      role: "MESERO",
      branchIds: ["b1"],
      active: true,
      exceptions: [],
    },
    {
      id: "u-diego",
      fullName: "Diego Salas",
      role: "COCINA",
      branchIds: ["b1"],
      active: true,
      exceptions: [],
    },
    {
      id: "u-carla",
      fullName: "Carla Benítez",
      role: "CAJERO",
      branchIds: ["b1"],
      active: false,
      exceptions: [],
      changes: [
        {
          kind: "BAJA",
          by: "u-abigail",
          byName: "Abigail Karam",
          reason: "Se muda de ciudad y deja el puesto a final de mes.",
          at: "2026-08-29T21:00:00.000Z",
        },
        {
          kind: "ALTA",
          role: "CAJERO",
          by: "u-abigail",
          byName: "Abigail Karam",
          reason: "Entra a caja para cubrir los turnos de la tarde entre semana.",
          at: "2026-03-04T13:00:00.000Z",
        },
      ],
    },
  ],
}).users;
