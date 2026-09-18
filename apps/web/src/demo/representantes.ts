/**
 * Datos de ejemplo del directorio de familias.
 *
 * Datos inventados hasta F0-04. En producción, el directorio vendrá del
 * servidor y las visitas se calcularán a partir del histórico de estancias,
 * no se teclearán.
 */
import { DirectorioRepresentantesSchema, type DirectorioRepresentantesDto } from "@l2/contracts";
import { DEMO_GUARDIANS } from "./parque.ts";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

export const DIRECTORIO_DEMO: DirectorioRepresentantesDto = DirectorioRepresentantesSchema.parse({
  representantes: [
    {
      id: DEMO_GUARDIANS[0]!.id,
      fullName: DEMO_GUARDIANS[0]!.fullName,
      contactReference: DEMO_GUARDIANS[0]!.contactReference,
      kids: [
        { id: "k1", name: "Valentina Rojas", nickname: "Vale", ageYears: 7 },
      ],
      visitas: 12,
      ultimaVisita: new Date(Date.now() - 2 * DIA).toISOString(),
    },
    {
      id: DEMO_GUARDIANS[1]!.id,
      fullName: DEMO_GUARDIANS[1]!.fullName,
      contactReference: DEMO_GUARDIANS[1]!.contactReference,
      kids: [
        { id: "k2", name: "Mateo Guerrero", ageYears: 5 },
      ],
      visitas: 3,
      ultimaVisita: new Date(Date.now() - 5 * DIA).toISOString(),
    },
    {
      id: DEMO_GUARDIANS[2]!.id,
      fullName: DEMO_GUARDIANS[2]!.fullName,
      contactReference: DEMO_GUARDIANS[2]!.contactReference,
      kids: [
        { id: "k3", name: "Isabella Prieto", nickname: "Isa", ageYears: 9 },
      ],
      visitas: 1,
      ultimaVisita: new Date(Date.now() - 15 * DIA).toISOString(),
    },
    {
      id: DEMO_GUARDIANS[3]!.id,
      fullName: DEMO_GUARDIANS[3]!.fullName,
      contactReference: DEMO_GUARDIANS[3]!.contactReference,
      kids: [
        { id: "k4", name: "Santiago Bermúdez", ageYears: 6 },
        { id: "k-sin-nombre", ageYears: 4 }, // DEC-28: Un niño sin nombre
      ],
      visitas: 5,
      ultimaVisita: new Date(Date.now() - 10 * DIA).toISOString(),
    },
    {
      id: "g5-inventado",
      fullName: "Familia Nueva",
      contactReference: "0412-0000000",
      kids: [
        { id: "k-nuevo", name: "Lucas Nueva", ageYears: 3 },
      ],
      visitas: 0,
      // Sin última visita porque visitas es 0
    },
  ],
});
