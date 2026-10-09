"use client";

import type { CatalogoDto, FamilyAccountDto } from "@l2/contracts";
import { avisar } from "@l2/ui";
import { EntradaEnCapa } from "../park/EntradaEnCapa.tsx";

/**
 * La entrada al parque desde la caja — B3-9 (M-31), B4-12.
 *
 * Una familia que llega directo a la caja a comprar la entrada de uno o varios niños se registra y se cobra sin salir de
 * ella. Es la misma capa que la del parque (`EntradaEnCapa`): la pulsera leída o tecleada, «Sin pulsera», el paquete más
 * común ya elegido, las medias, la cédula del representante y el mismo registro del servidor (aforo, pulsera de un solo
 * uso, tarifario; la monitora los ve en la sala). «Registrar y cobrar» deja la cuenta elegida en la columna de cobro.
 *
 * Solo prepago: los invitados de un cumpleaños y la cuenta abierta siguen en el parque.
 */
export function EntradaDesdeCaja({
  abierto,
  pedido,
  catalogo,
  conTurno,
  onCerrar,
  onRegistrada,
}: {
  abierto: boolean;
  /** La pulsera que abrió el panel (una que no está en la sala), con su número de pedido: se suma una vez. */
  pedido: Readonly<{ codigo: string | null; n: number }> | null;
  catalogo: CatalogoDto;
  /** Sin turno abierto en este equipo no se cobra: el panel lo dice y no registra. */
  conTurno: boolean;
  onCerrar: () => void;
  onRegistrada: (cuenta: FamilyAccountDto) => void;
}) {
  return (
    <EntradaEnCapa
      abierto={abierto}
      pedido={pedido}
      catalogo={catalogo}
      desde="CAJA"
      conTurno={conTurno}
      onCerrar={onCerrar}
      onRegistrada={(cuenta, _modo, n) => {
        avisar.ok(`${n === 1 ? "Entró 1 niño" : `Entraron ${n} niños`}: ${cuenta.family}`, { detalle: "Su cuenta está lista para cobrar." });
        onRegistrada(cuenta);
      }}
    />
  );
}
