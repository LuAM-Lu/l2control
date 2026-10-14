"use client";

import { useCallback, useState } from "react";
import type { Rechazo, Resultado, VincularPulserasCommand, VincularPulserasResultDto } from "@l2/contracts";
import { Confirmacion } from "@l2/ui";
import { vincularPulseras } from "./mesas.acciones.ts";

/**
 * Vincular a la mesa de otra familia — B6-20 (M-39, X-15).
 *
 * Si el representante de un niño no es el cliente de la mesa, el servidor no vincula y lo dice («Este niño es de Yenua
 * Akvini y la mesa 4 es de Real Parra: ¿vincular igual?»). La tablet y la sala preguntan con estas piezas y, confirmado,
 * vinculan igual: queda en la auditoría.
 */

const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se vinculó." };

/** La pregunta, como promesa: `preguntar(mensaje)` abre la confirmación y resuelve con la respuesta. */
export function usePreguntaOtraFamilia() {
  const [pregunta, setPregunta] = useState<{ mensaje: string; responder: (si: boolean) => void } | null>(null);
  const preguntar = useCallback((mensaje: string) => new Promise<boolean>((responder) => setPregunta({ mensaje, responder })), []);
  const responder = (si: boolean) => {
    pregunta?.responder(si);
    setPregunta(null);
  };
  const dialogo = (
    <Confirmacion
      abierto={pregunta !== null}
      onCerrar={() => responder(false)}
      titulo="¿Es de otra familia?"
      confirmar="Sí, vincular igual"
      onConfirmar={() => responder(true)}
    >
      <p>{pregunta?.mensaje}</p>
    </Confirmacion>
  );
  return { preguntar, dialogo };
}

/**
 * Vincula; si la mesa es de otra familia, pregunta y, con el sí, vincula igual. `null` si se respondió que no: no se
 * hizo nada y no hay error que avisar.
 */
export async function vincularPreguntando(
  cmd: Omit<VincularPulserasCommand, "otraFamilia">,
  preguntar: (mensaje: string) => Promise<boolean>,
): Promise<Resultado<VincularPulserasResultDto> | null> {
  const r = await vincularPulseras(cmd).catch(() => sinConexion);
  if (r.ok || !r.problemas?.some((p) => p.message === "OTRA_FAMILIA")) return r;
  if (!(await preguntar(r.mensaje))) return null;
  return vincularPulseras({ ...cmd, otraFamilia: true }).catch(() => sinConexion);
}
