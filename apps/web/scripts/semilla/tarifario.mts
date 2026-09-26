/**
 * El tarifario de DESARROLLO que publica `pnpm db:semilla` como versión 1 (B0-5).
 * Inventado: los precios reales llegan con F0-04 y B7-2. Se valida contra el contrato al
 * construirse, así que un cambio que lo rompa revienta aquí y no en la base.
 */
import {
  ParkPolicySchema,
  PricePackageSchema,
  TarifarioSchema,
  type ParkPolicyDto,
  type PricePackageDto,
  type TarifarioDto,
} from "@l2/contracts";

/** Catálogo de tarifas. En producción es configuración editable (§9.9). */
const PAQUETES: PricePackageDto[] = [
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


const POLITICA: ParkPolicyDto = ParkPolicySchema.parse({
  graceMinutes: 5,
  penaltyBlockMinutes: 15,
  penaltyPricePerBlock: { minor: "150", currency: "USD" },
  warnBeforeMinutes: 10,
  capacityLimit: 30,
});

export const TARIFARIO_DESARROLLO: TarifarioDto = TarifarioSchema.parse({
  packages: PAQUETES,
  policy: POLITICA,
});

