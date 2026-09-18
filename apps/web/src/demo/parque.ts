/**
 * Datos de ejemplo del parque — DERIVADOS DEL CONTRATO.
 *
 * §11.4: el orden frontend → backend solo funciona si los datos de ejemplo
 * salen del contrato y no al revés. Por eso cada objeto de este archivo se
 * **valida contra su esquema al construirse**: si alguien inventa un campo
 * que el contrato no declara, o se salta uno obligatorio, esto revienta aquí
 * y no meses después cuando llegue el backend.
 *
 * Cuando exista el servidor, se sustituye la fuente y **las pantallas no
 * cambian**: ya consumen la forma definitiva.
 */
import {
  GuardianSchema,
  MonitorSnapshotSchema,
  PricePackageSchema,
  ParkPolicySchema,
  TarifarioSchema,
  type GuardianDto,
  type MonitorSnapshotDto,
  type PricePackageDto,
  type ParkPolicyDto,
  type TarifarioDto,
} from "@l2/contracts";

const MIN = 60_000;

/** Catálogo de tarifas. En producción es configuración editable (§9.9). */
export const DEMO_PACKAGES: PricePackageDto[] = [
  {
    id: "pkg-30",
    name: "30 minutos",
    mode: "PREPAGO",
    duration: { kind: "fixed", minutes: 30 },
    price: { minor: "300", currency: "USD" },
    active: true,
  },
  {
    id: "pkg-60",
    name: "1 hora",
    mode: "PREPAGO",
    duration: { kind: "fixed", minutes: 60 },
    price: { minor: "500", currency: "USD" },
    active: true,
  },
  {
    id: "pkg-120",
    name: "2 horas",
    mode: "PREPAGO",
    duration: { kind: "fixed", minutes: 120 },
    price: { minor: "900", currency: "USD" },
    active: true,
  },
  {
    id: "pkg-libre",
    name: "Pase libre",
    mode: "POSTPAGO",
    duration: { kind: "openEnded" },
    price: { minor: "1200", currency: "USD" },
    active: true,
  },
].map((p) => PricePackageSchema.parse(p));

/**
 * Representantes ya conocidos, para la búsqueda de F5-03.
 *
 * Que un representante recurrente no se vuelva a registrar es la mitad de los
 * 90 segundos que exige F5-02: teclear un nombre y un teléfono en una tablet,
 * con cola detrás, es lo que se lleva el tiempo.
 */
export const DEMO_GUARDIANS: (GuardianDto & { id: string })[] = [
  { id: "g1", fullName: "Ana Rojas", contactReference: "0412-1234567" },
  { id: "g2", fullName: "Luis Guerrero", contactReference: "0414-7654321" },
  { id: "g3", fullName: "Marisol Prieto", contactReference: "0424-5551234" },
  { id: "g4", fullName: "Pedro Bermúdez", contactReference: "0416-9876543" },
].map((g) => ({ ...GuardianSchema.parse(g), id: g.id }));

export const DEMO_POLICY: ParkPolicyDto = ParkPolicySchema.parse({
  graceMinutes: 5,
  penaltyBlockMinutes: 15,
  penaltyPricePerBlock: { minor: "150", currency: "USD" },
  warnBeforeMinutes: 10,
  capacityLimit: 30,
});

export const TARIFARIO_DEMO: TarifarioDto = TarifarioSchema.parse({
  packages: DEMO_PACKAGES,
  policy: DEMO_POLICY,
});

/**
 * Instantánea del monitor. Es exactamente lo que devolverá el servidor.
 *
 * `serverNow` se pasa como argumento —no se lee el reloj aquí— para que
 * esta función siga siendo determinista, igual que el dominio (ADR-010).
 */
export function demoSnapshot(serverNow: number): MonitorSnapshotDto {
  const iso = (msAgo: number) => new Date(serverNow - msAgo * MIN).toISOString();

  const crudo = {
    serverNow: new Date(serverNow).toISOString(),
    shiftLabel: "Turno tarde · abierto 14:00",
    policy: DEMO_POLICY,
    rate: {
      id: "rate-1",
      pair: "USD/VES",
      value: "228.41",
      source: "BCV",
      capturedAt: new Date(serverNow - 6 * 60 * MIN).toISOString(),
      capturedBy: "Sincronización BCV",
      // Confirmada por una persona, con su firma: el contrato ya no admite una
      // tasa confirmada que no diga quién la confirmó y cuándo (§5.2, §7.4).
      confirmed: true,
      confirmedBy: "Abigail Karam",
      confirmedAt: new Date(serverNow - 5 * 60 * MIN).toISOString(),
    },
    sessions: [
      {
        id: "s1",
        wristbandCode: "AK-0142",
        kid: { id: "k1", name: "Valentina Rojas", nickname: "Vale", ageYears: 7 },
        mode: "PREPAGO",
        duration: { kind: "fixed", minutes: 60 },
        startedAt: iso(12),
        packageId: "pkg-60",
        packagePrice: { minor: "500", currency: "USD" },
      },
      {
        id: "s2",
        wristbandCode: "AK-0143",
        kid: { id: "k2", name: "Mateo Guerrero", ageYears: 5 },
        mode: "PREPAGO",
        duration: { kind: "fixed", minutes: 30 },
        startedAt: iso(24),
        packageId: "pkg-30",
        packagePrice: { minor: "300", currency: "USD" },
      },
      {
        id: "s3",
        wristbandCode: "AK-0147",
        kid: { id: "k3", name: "Isabella Prieto", nickname: "Isa", ageYears: 9 },
        mode: "PREPAGO",
        duration: { kind: "fixed", minutes: 60 },
        startedAt: iso(58),
        packageId: "pkg-60",
        packagePrice: { minor: "500", currency: "USD" },
      },
      {
        id: "s4",
        wristbandCode: "AK-0151",
        kid: { id: "k4", name: "Santiago Bermúdez", ageYears: 6 },
        mode: "PREPAGO",
        duration: { kind: "fixed", minutes: 30 },
        startedAt: iso(37),
        packageId: "pkg-30",
        packagePrice: { minor: "300", currency: "USD" },
      },
      {
        id: "s5",
        wristbandCode: "AK-0158",
        kid: { id: "k5", name: "Camila Nieves", ageYears: 8 },
        mode: "POSTPAGO",
        duration: { kind: "openEnded" },
        startedAt: iso(41),
        packageId: "pkg-libre",
        packagePrice: { minor: "1200", currency: "USD" },
      },
      {
        id: "s6",
        wristbandCode: "AK-0160",
        kid: { id: "k6", name: "Diego Alcántara", nickname: "Dieguito", ageYears: 4 },
        mode: "PREPAGO",
        duration: { kind: "fixed", minutes: 120 },
        startedAt: iso(8),
        packageId: "pkg-120",
        packagePrice: { minor: "900", currency: "USD" },
      },
      {
        id: "s7",
        wristbandCode: "AK-0163",
        kid: { id: "k7", name: "Antonella Salas", ageYears: 10 },
        mode: "PREPAGO",
        duration: { kind: "fixed", minutes: 60 },
        startedAt: iso(52),
        packageId: "pkg-60",
        packagePrice: { minor: "500", currency: "USD" },
      },
      {
        id: "s8",
        wristbandCode: "AK-0171",
        kid: { id: "k8", name: "Emiliano Paredes", ageYears: 6 },
        mode: "POSTPAGO",
        duration: { kind: "openEnded" },
        startedAt: iso(6),
        packageId: "pkg-libre",
        packagePrice: { minor: "1200", currency: "USD" },
      },
    ],
  };

  // La validación no es ceremonia: es lo que garantiza que estas pantallas
  // consuman hoy la misma forma que consumirán del servidor mañana.
  return MonitorSnapshotSchema.parse(crudo);
}
