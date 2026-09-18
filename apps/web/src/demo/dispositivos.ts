/**
 * Dispositivos de ejemplo para la pantalla de dispositivos (F2-02).
 *
 * Se validan contra el contrato AL CONSTRUIRSE, igual que el resto de datos
 * de ejemplo (§11.4). Son datos inventados hasta que exista el registro real.
 */
import { DevicesDirectorySchema } from "@l2/contracts";

export const DEMO_DISPOSITIVOS = DevicesDirectorySchema.parse({
  devices: [
    {
      id: "dev-taquilla",
      label: "Tablet taquilla",
      branchId: "b1",
      status: "APROBADO",
      registeredAt: "2026-09-01T08:00:00.000Z",
      changes: [
        {
          kind: "ALTA",
          by: "sistema",
          byName: "Sistema",
          reason: "Registro inicial",
          at: "2026-09-01T08:00:00.000Z",
        },
        {
          kind: "APROBADO",
          by: "u-abigail",
          byName: "Abigail Karam",
          reason: "Autorizada para la taquilla principal.",
          at: "2026-09-01T08:05:00.000Z",
        },
      ],
    },
    {
      id: "dev-caja",
      label: "Tablet caja",
      branchId: "b1",
      status: "APROBADO",
      registeredAt: "2026-09-05T09:00:00.000Z",
      session: {
        userId: "u-marisol",
        userName: "Marisol Prieto",
        since: "2026-09-18T10:00:00.000Z",
      },
      changes: [
        {
          kind: "ALTA",
          by: "sistema",
          byName: "Sistema",
          reason: "Registro inicial",
          at: "2026-09-05T09:00:00.000Z",
        },
        {
          kind: "APROBADO",
          by: "u-abigail",
          byName: "Abigail Karam",
          reason: "Autorizada para la caja del local.",
          at: "2026-09-05T09:10:00.000Z",
        },
      ],
    },
    {
      id: "dev-mesero3",
      label: "Tablet mesero 3",
      branchId: "b1",
      status: "PENDIENTE",
      registeredAt: "2026-09-17T15:30:00.000Z",
      changes: [
        {
          kind: "ALTA",
          by: "sistema",
          byName: "Sistema",
          reason: "Intento de registro desde el salón.",
          at: "2026-09-17T15:30:00.000Z",
        },
      ],
    },
    {
      id: "dev-extraviada",
      label: "Tablet extraviada",
      branchId: "b1",
      status: "REVOCADO",
      registeredAt: "2026-08-10T11:00:00.000Z",
      changes: [
        {
          kind: "ALTA",
          by: "sistema",
          byName: "Sistema",
          reason: "Registro inicial",
          at: "2026-08-10T11:00:00.000Z",
        },
        {
          kind: "APROBADO",
          by: "u-abigail",
          byName: "Abigail Karam",
          reason: "Tablet para apoyo en sala.",
          at: "2026-08-10T11:15:00.000Z",
        },
        {
          kind: "REVOCADO",
          by: "u-abigail",
          byName: "Abigail Karam",
          reason: "Se extravió durante el cierre del sábado pasado, revocada por seguridad.",
          at: "2026-09-12T23:45:00.000Z",
        },
      ],
    },
  ],
});
