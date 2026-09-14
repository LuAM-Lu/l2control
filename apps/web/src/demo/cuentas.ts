/**
 * Cuentas de ejemplo — DEC-21.
 *
 * Una por familia de los ocho niños que están en sala en el monitor de
 * ejemplo, más una familia que ya se fue y espera en la cola de la caja. Se
 * validan contra el contrato al construirse, como todos los datos de ejemplo
 * (§11.4). Las fechas son fijas a propósito: así el servidor y el navegador
 * pintan lo mismo al hidratar.
 */
import { FamilyAccountSchema } from "@l2/contracts";

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const paquete = (cuenta: string, sessionId: string, concept: string, minor: string, paid: boolean) => ({
  id: `${cuenta}-${sessionId}`,
  concept,
  kind: "PAQUETE" as const,
  amount: usd(minor),
  paid,
  sessionId,
});
const prepago = (id: string, family: string, sessionId: string, concept: string, minor: string) => ({
  id,
  family,
  mode: "PREPAGO" as const,
  status: "ABIERTA" as const,
  openedAt: "2026-09-11T18:20:00.000Z",
  sessionIds: [sessionId],
  closedSessionIds: [],
  lines: [paquete(id, sessionId, concept, minor, true)],
});

const CUENTAS = FamilyAccountSchema.array().parse([
  prepago("c-rojas", "Ana Rojas", "s1", "Paquete 1 hora · Vale", "500"),
  prepago("c-guerrero", "Luis Guerrero", "s2", "Paquete 30 minutos · Mateo", "300"),
  prepago("c-prieto", "Marisol Prieto", "s3", "Paquete 1 hora · Isa", "500"),
  prepago("c-bermudez", "Pedro Bermúdez", "s4", "Paquete 30 minutos · Santiago", "300"),
  prepago("c-alcantara", "Rosa Alcántara", "s6", "Paquete 2 horas · Dieguito", "900"),
  prepago("c-salas", "Jorge Salas", "s7", "Paquete 1 hora · Antonella", "500"),
  {
    id: "c-nieves",
    family: "Laura Nieves",
    mode: "CUENTA_ABIERTA",
    status: "ABIERTA",
    openedAt: "2026-09-11T18:31:00.000Z",
    sessionIds: ["s5"],
    closedSessionIds: [],
    lines: [paquete("c-nieves", "s5", "Pase libre · Camila", "1200", false)],
  },
  {
    // Cuenta abierta con consumo en el restaurante: se paga todo junto al
    // salir, que es el diferencial del producto.
    id: "c-paredes",
    family: "Elena Paredes",
    mode: "CUENTA_ABIERTA",
    status: "ABIERTA",
    openedAt: "2026-09-11T19:05:00.000Z",
    sessionIds: ["s8"],
    closedSessionIds: [],
    lines: [
      paquete("c-paredes", "s8", "Pase libre · Emiliano", "1200", false),
      {
        id: "c-paredes-mesa4",
        concept: "Mesa 4 · dos jugos y una pizza",
        kind: "RESTAURANTE",
        amount: usd("950"),
        paid: false,
      },
    ],
  },
  {
    // Una familia que ya salió y espera en la cola de la caja.
    id: "c-mendez",
    family: "Carolina Méndez",
    mode: "CUENTA_ABIERTA",
    status: "POR_COBRAR",
    openedAt: "2026-09-11T17:10:00.000Z",
    sessionIds: ["h1", "h2"],
    closedSessionIds: ["h1", "h2"],
    lines: [
      paquete("c-mendez", "h1", "Paquete 1 hora · Sofi", "500", false),
      paquete("c-mendez", "h2", "Paquete 30 minutos · Leo", "300", false),
      {
        id: "c-mendez-exc-h2",
        concept: "Tiempo de más · Leo (1 bloque)",
        kind: "EXCEDENTE",
        amount: usd("150"),
        paid: false,
        sessionId: "h2",
      },
    ],
  },
]);

/** Con su número de orden: el turno de ejemplo ya llevaba unas cuantas cuentas. */
export const DEMO_CUENTAS = CUENTAS.map((c, i) => ({ ...c, orderNumber: 1041 + i }));
